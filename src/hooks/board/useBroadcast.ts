'use client'

import { useCallback, useEffect, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { HLC, tickHLC, receiveHLC } from '@/lib/crdt/hlc'
import { FieldClocks, mergeFields, mergeClocks, stampFields, shouldDeleteWin } from '@/lib/crdt/merge'

export const CRDT_ENABLED = process.env.NEXT_PUBLIC_CRDT_ENABLED === 'true'

// ── Types ───────────────────────────────────────────────────────────

export interface BoardChange {
  action: 'create' | 'update' | 'delete'
  object: Partial<BoardObject> & { id: string }
  timestamp?: number
  clocks?: FieldClocks
}

// ── Constants ───────────────────────────────────────────────────────

const BROADCAST_IDLE_MS = 5    // flush quickly if no burst follows
const BROADCAST_MAX_MS = 50    // ceiling for burst batching
const BROADCAST_WARN_BYTES = 50 * 1024  // warn when payload exceeds 50KB
const BROADCAST_MAX_BYTES = 64 * 1024   // Supabase Realtime limit ~64KB
const RECEIVE_BATCH_MS = 10

// ── Pure functions ──────────────────────────────────────────────────

/**
 * Coalesces a queue of broadcast changes from a single user within a batch window.
 * Deduplicates updates to the same object ID (merges partial updates), preserving
 * create/delete ordering.
 */
export function coalesceBroadcastQueue(pending: BoardChange[]): BoardChange[] {
  const result: BoardChange[] = []
  const seen = new Map<string, number>() // object id -> index in result

  for (const change of pending) {
    const id = change.object.id
    const existingIdx = seen.get(id)

    if (change.action === 'delete') {
      if (existingIdx !== undefined && result[existingIdx]?.action === 'create') {
        result[existingIdx] = undefined as unknown as BoardChange
        seen.delete(id)
      } else if (existingIdx !== undefined) {
        result[existingIdx] = change
      } else {
        seen.set(id, result.length)
        result.push(change)
      }
    } else if (change.action === 'update' && existingIdx !== undefined) {
      const existing = result[existingIdx]
      if (existing && (existing.action === 'update' || existing.action === 'create')) {
        result[existingIdx] = {
          ...existing,
          object: { ...existing.object, ...change.object },
          timestamp: change.timestamp ?? existing.timestamp,
          clocks: existing.clocks && change.clocks
            ? mergeClocks(existing.clocks, change.clocks)
            : change.clocks ?? existing.clocks,
        }
      }
    } else {
      seen.set(id, result.length)
      result.push(change)
    }
  }

  return result.filter(Boolean)
}

// ── Hook interface ──────────────────────────────────────────────────

export interface UseBroadcastDeps {
  channel: RealtimeChannel | null | undefined
  userId: string
  setObjects: React.Dispatch<React.SetStateAction<Map<string, BoardObject>>>
  fieldClocksRef: React.RefObject<Map<string, FieldClocks>>
  hlcRef: React.MutableRefObject<HLC>
}

// ── Hook ────────────────────────────────────────────────────────────

export function useBroadcast({ channel, userId, setObjects, fieldClocksRef, hlcRef }: UseBroadcastDeps) {
  // ── Outbound batching refs ──
  const pendingBroadcastRef = useRef<BoardChange[]>([])
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Inbound batching refs ──
  const incomingBatchRef = useRef<BoardChange[]>([])
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Send to channel (with chunking) ──
  const broadcastChanges = useCallback((changes: BoardChange[]) => {
    if (!channel) return
    if ((channel as unknown as { state: string }).state !== 'joined') return

    const payload = { changes, sender_id: userId }
    const serialized = JSON.stringify(payload)
    const byteSize = new TextEncoder().encode(serialized).byteLength

    if (byteSize <= BROADCAST_MAX_BYTES) {
      if (byteSize > BROADCAST_WARN_BYTES) {
        console.warn(`Broadcast payload near limit: ${(byteSize / 1024).toFixed(1)}KB`)
      }
      channel.send({ type: 'broadcast', event: 'board:sync', payload })
    } else {
      const chunks: BoardChange[][] = []
      let current: BoardChange[] = []
      let currentSize = 0
      const overhead = new TextEncoder().encode(JSON.stringify({ changes: [], sender_id: userId })).byteLength

      for (const change of changes) {
        const changeSize = new TextEncoder().encode(JSON.stringify(change)).byteLength + 1
        if (current.length > 0 && currentSize + changeSize + overhead > BROADCAST_MAX_BYTES) {
          chunks.push(current)
          current = []
          currentSize = 0
        }
        current.push(change)
        currentSize += changeSize
      }
      if (current.length > 0) chunks.push(current)

      console.warn(`Broadcast payload ${(byteSize / 1024).toFixed(1)}KB exceeds limit, splitting into ${chunks.length} chunks`)
      for (const chunk of chunks) {
        channel.send({
          type: 'broadcast',
          event: 'board:sync',
          payload: { changes: chunk, sender_id: userId },
        })
      }
    }
  }, [channel, userId])

  // ── Flush outbound queue ──
  const flushBroadcast = useCallback(() => {
    if (broadcastTimerRef.current) { clearTimeout(broadcastTimerRef.current); broadcastTimerRef.current = null }
    if (broadcastIdleTimerRef.current) { clearTimeout(broadcastIdleTimerRef.current); broadcastIdleTimerRef.current = null }
    if (pendingBroadcastRef.current.length === 0) return
    const coalesced = coalesceBroadcastQueue(pendingBroadcastRef.current)
    pendingBroadcastRef.current = []
    if (coalesced.length > 0) {
      broadcastChanges(coalesced)
    }
  }, [broadcastChanges])

  // ── Queue outbound changes with idle+max timers ──
  const queueBroadcast = useCallback((changes: BoardChange[]) => {
    const stamped = changes.map(c => ({ ...c, timestamp: c.timestamp ?? Date.now() }))
    pendingBroadcastRef.current.push(...stamped)

    if (broadcastIdleTimerRef.current) {
      clearTimeout(broadcastIdleTimerRef.current)
    }

    if (!broadcastTimerRef.current) {
      broadcastTimerRef.current = setTimeout(flushBroadcast, BROADCAST_MAX_MS)
    }

    broadcastIdleTimerRef.current = setTimeout(flushBroadcast, BROADCAST_IDLE_MS)
  }, [flushBroadcast])

  // ── CRDT stamp helpers ──
  const stampChange = useCallback((objectId: string, changedFields: string[]): FieldClocks | undefined => {
    if (!CRDT_ENABLED) return undefined
    hlcRef.current = tickHLC(hlcRef.current)
    const clocks = stampFields(changedFields, hlcRef.current)
    const existing = fieldClocksRef.current.get(objectId)
    fieldClocksRef.current.set(objectId, existing ? mergeClocks(existing, clocks) : clocks)
    return clocks
  }, [])

  const stampCreate = useCallback((objectId: string, obj: Partial<BoardObject>): FieldClocks | undefined => {
    if (!CRDT_ENABLED) return undefined
    hlcRef.current = tickHLC(hlcRef.current)
    const fields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by' && k !== 'created_at' && k !== 'updated_at')
    const clocks = stampFields(fields, hlcRef.current)
    fieldClocksRef.current.set(objectId, clocks)
    return clocks
  }, [])

  // ── Apply incoming batch ──
  const applyIncomingBatch = useCallback(() => {
    incomingTimerRef.current = null
    const batch = incomingBatchRef.current
    if (batch.length === 0) return
    incomingBatchRef.current = []

    setObjects(prev => {
      const next = new Map(prev)
      for (const change of batch) {
        switch (change.action) {
          case 'create':
            next.set(change.object.id, change.object as BoardObject)
            if (CRDT_ENABLED && change.clocks) {
              const existing = fieldClocksRef.current.get(change.object.id)
              fieldClocksRef.current.set(
                change.object.id,
                existing ? mergeClocks(existing, change.clocks) : change.clocks
              )
            }
            break
          case 'update': {
            const existing = next.get(change.object.id)
            if (!existing) break

            if (CRDT_ENABLED && change.clocks) {
              const localClocks = fieldClocksRef.current.get(change.object.id) ?? {}
              const { merged, clocks: newClocks, changed } = mergeFields(
                existing as unknown as Record<string, unknown>,
                localClocks,
                change.object as unknown as Record<string, unknown>,
                change.clocks,
              )
              if (changed) {
                next.set(change.object.id, merged as unknown as BoardObject)
                fieldClocksRef.current.set(change.object.id, newClocks)
              }
            } else {
              next.set(change.object.id, { ...existing, ...change.object })
            }
            break
          }
          case 'delete': {
            if (CRDT_ENABLED && change.clocks?._deleted) {
              const objectClocks = fieldClocksRef.current.get(change.object.id) ?? {}
              if (shouldDeleteWin(change.clocks._deleted, objectClocks)) {
                next.delete(change.object.id)
              }
            } else {
              next.delete(change.object.id)
              fieldClocksRef.current.delete(change.object.id)
            }
            break
          }
        }
      }
      return next
    })
  }, [])

  // ── Listen for incoming broadcasts ──
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { changes: BoardChange[]; sender_id: string } }) => {
      if (payload.sender_id === userId) return

      // Advance local HLC from any remote clocks
      if (CRDT_ENABLED) {
        for (const change of payload.changes) {
          if (change.clocks) {
            for (const remoteClock of Object.values(change.clocks)) {
              hlcRef.current = receiveHLC(hlcRef.current, remoteClock)
            }
          }
        }
      }

      incomingBatchRef.current.push(...payload.changes)
      if (!incomingTimerRef.current) {
        incomingTimerRef.current = setTimeout(applyIncomingBatch, RECEIVE_BATCH_MS)
      }
    }

    channel.on('broadcast', { event: 'board:sync' }, handler)
  }, [channel, userId, applyIncomingBatch])

  // ── Cleanup timers on unmount ──
  useEffect(() => {
    return () => {
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current)
        broadcastTimerRef.current = null
      }
      if (broadcastIdleTimerRef.current) {
        clearTimeout(broadcastIdleTimerRef.current)
        broadcastIdleTimerRef.current = null
      }
      if (incomingTimerRef.current) {
        clearTimeout(incomingTimerRef.current)
        incomingTimerRef.current = null
      }
    }
  }, [])

  return {
    queueBroadcast,
    flushBroadcast,
    stampChange,
    stampCreate,
    fieldClocksRef,
    hlcRef,
  }
}
