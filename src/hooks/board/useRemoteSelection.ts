'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { OnlineUser } from '@/hooks/usePresence'

// ── Constants ───────────────────────────────────────────────────────

const SELECTION_BROADCAST_DEBOUNCE_MS = 50
const RECEIVE_BATCH_MS = 10

// ── Hook interface ──────────────────────────────────────────────────

export interface UseRemoteSelectionDeps {
  channel: RealtimeChannel | null | undefined
  userId: string
  selectedIds: Set<string>
  onlineUsers?: OnlineUser[]
}

// ── Hook ────────────────────────────────────────────────────────────

export function useRemoteSelection({ channel, userId, selectedIds, onlineUsers }: UseRemoteSelectionDeps) {
  const [remoteSelections, setRemoteSelections] = useState<Map<string, Set<string>>>(new Map())

  // ── Broadcast local selection (debounced) ─────────────────────

  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!channel) return

    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    selectionTimerRef.current = setTimeout(() => {
      if ((channel as unknown as { state: string }).state !== 'joined') return
      channel.send({
        type: 'broadcast',
        event: 'selection',
        payload: { user_id: userId, selected_ids: Array.from(selectedIds) },
      })
    }, SELECTION_BROADCAST_DEBOUNCE_MS)

    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    }
  }, [selectedIds, channel, userId])

  // ── Receive remote selections (batched) ───────────────────────

  const pendingSelectionsRef = useRef<Map<string, string[]>>(new Map())
  const selectionFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushSelections = useCallback(() => {
    const pending = pendingSelectionsRef.current
    if (pending.size === 0) return
    setRemoteSelections(prev => {
      const next = new Map(prev)
      for (const [uid, ids] of pending) {
        if (ids.length === 0) {
          next.delete(uid)
        } else {
          next.set(uid, new Set(ids))
        }
      }
      return next
    })
    pendingSelectionsRef.current = new Map()
    selectionFlushTimerRef.current = null
  }, [])

  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { user_id: string; selected_ids: string[] } }) => {
      if (payload.user_id === userId) return
      pendingSelectionsRef.current.set(payload.user_id, payload.selected_ids)
      if (!selectionFlushTimerRef.current) {
        selectionFlushTimerRef.current = setTimeout(flushSelections, RECEIVE_BATCH_MS)
      }
    }

    channel.on('broadcast', { event: 'selection' }, handler)
    return () => {
      if (selectionFlushTimerRef.current) {
        clearTimeout(selectionFlushTimerRef.current)
        selectionFlushTimerRef.current = null
      }
    }
  }, [channel, userId, flushSelections])

  // ── Clean up when users leave ─────────────────────────────────

  useEffect(() => {
    if (!onlineUsers) return
    const onlineIds = new Set(onlineUsers.map(u => u.user_id))
    setRemoteSelections(prev => {
      let changed = false
      const next = new Map(prev)
      for (const uid of next.keys()) {
        if (!onlineIds.has(uid)) {
          next.delete(uid)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [onlineUsers])

  return { remoteSelections }
}
