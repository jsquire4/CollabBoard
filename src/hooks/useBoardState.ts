'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardObject, BoardObjectType } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { OnlineUser } from '@/hooks/usePresence'
import { HLC, createHLC, tickHLC, receiveHLC, hlcGreaterThan } from '@/lib/crdt/hlc'
import { FieldClocks, mergeFields, mergeClocks, stampFields, shouldDeleteWin } from '@/lib/crdt/merge'
import { shapeRegistry } from '@/components/board/shapeRegistry'

const CRDT_ENABLED = process.env.NEXT_PUBLIC_CRDT_ENABLED === 'true'

interface BoardChange {
  action: 'create' | 'update' | 'delete'
  object: Partial<BoardObject> & { id: string }
  timestamp?: number
  clocks?: FieldClocks
}

const COLOR_PALETTE = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50']

// Explicit column list for board_objects queries (avoids pulling large JSONB when not needed)
const BOARD_OBJECT_COLUMNS = [
  'id', 'board_id', 'type', 'x', 'y', 'x2', 'y2', 'width', 'height', 'rotation',
  'text', 'color', 'font_size', 'font_family', 'font_style',
  'stroke_width', 'stroke_dash', 'stroke_color',
  'opacity', 'shadow_color', 'shadow_blur', 'shadow_offset_x', 'shadow_offset_y',
  'text_align', 'text_vertical_align', 'text_padding', 'text_color',
  'corner_radius', 'title', 'locked_by',
  'sides', 'custom_points',
  'connect_start_id', 'connect_start_anchor', 'connect_end_id', 'connect_end_anchor', 'waypoints',
  'z_index', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at',
].join(',')

const BOARD_OBJECT_SELECT = CRDT_ENABLED
  ? BOARD_OBJECT_COLUMNS + ',field_clocks'
  : BOARD_OBJECT_COLUMNS

const SELECTION_BROADCAST_DEBOUNCE_MS = 50
const BROADCAST_IDLE_MS = 5    // flush quickly if no burst follows
const BROADCAST_MAX_MS = 50    // ceiling for burst batching
const BROADCAST_WARN_BYTES = 50 * 1024  // warn when payload exceeds 50KB
const BROADCAST_MAX_BYTES = 64 * 1024   // Supabase Realtime limit ~64KB

/**
 * Coalesces a queue of broadcast changes from a single user within a batch window.
 * Deduplicates updates to the same object ID (merges partial updates), preserving
 * create/delete ordering. Isolated as a pure function so it can be swapped for
 * CRDT-aware merge logic later.
 */
export function coalesceBroadcastQueue(pending: BoardChange[]): BoardChange[] {
  const result: BoardChange[] = []
  const seen = new Map<string, number>() // object id -> index in result

  for (const change of pending) {
    const id = change.object.id
    const existingIdx = seen.get(id)

    if (change.action === 'delete') {
      // If there's a prior create for this id, remove it entirely
      if (existingIdx !== undefined && result[existingIdx]?.action === 'create') {
        result[existingIdx] = undefined as unknown as BoardChange // mark for removal
        seen.delete(id)
      } else if (existingIdx !== undefined) {
        // Replace any prior update with delete
        result[existingIdx] = change
      } else {
        seen.set(id, result.length)
        result.push(change)
      }
    } else if (change.action === 'update' && existingIdx !== undefined) {
      const existing = result[existingIdx]
      if (existing && (existing.action === 'update' || existing.action === 'create')) {
        // Merge partial updates, merging clocks when both carry them
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

export function useBoardState(userId: string, boardId: string, userRole: BoardRole = 'viewer', channel?: RealtimeChannel | null, onlineUsers?: OnlineUser[]) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const objectsRef = useRef<Map<string, BoardObject>>(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [remoteSelections, setRemoteSelections] = useState<Map<string, Set<string>>>(new Map())
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // CRDT clock state (in-memory only for Phase 1; persisted in Phase 2)
  const hlcRef = useRef<HLC>(createHLC(userId))
  const fieldClocksRef = useRef<Map<string, FieldClocks>>(new Map())

  const canEdit = userRole !== 'viewer'

  // Extracted so it can be called on mount and on reconnect
  const loadObjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_objects')
      .select(BOARD_OBJECT_SELECT)
      .eq('board_id', boardId)
      .is('deleted_at', null) as unknown as { data: (BoardObject & { field_clocks?: FieldClocks })[] | null; error: { message: string } | null }

    if (error) {
      console.error('Failed to load board objects:', error.message)
      return
    }

    const map = new Map<string, BoardObject>()
    const clocksMap = new Map<string, FieldClocks>()
    for (const obj of data ?? []) {
      map.set(obj.id, obj as BoardObject)
      // Restore field clocks from DB if present
      if (CRDT_ENABLED && obj.field_clocks && typeof obj.field_clocks === 'object') {
        clocksMap.set(obj.id, obj.field_clocks as FieldClocks)
      }
    }
    setObjects(map)
    if (CRDT_ENABLED) {
      fieldClocksRef.current = clocksMap
    }
  }, [boardId])

  // Load on mount
  useEffect(() => {
    loadObjects()
  }, [loadObjects])

  // CRDT Phase 3: Reconcile local state against DB on reconnect.
  // Compares local field clocks against DB clocks and pushes any local
  // wins to the Edge Function for server-side merge.
  const reconcileOnReconnect = useCallback(async () => {
    if (!CRDT_ENABLED) return

    // Fetch current DB state (including clocks)
    const { data: dbObjects, error } = await supabase
      .from('board_objects')
      .select('id, field_clocks')
      .eq('board_id', boardId)
      .is('deleted_at', null)

    if (error) {
      console.error('Failed to fetch DB state for reconciliation:', error.message)
      return
    }

    const dbClocksMap = new Map<string, FieldClocks>()
    for (const row of dbObjects ?? []) {
      dbClocksMap.set(row.id, (row.field_clocks ?? {}) as FieldClocks)
    }

    // Find fields where local clock beats DB clock
    const localWins: {
      action: 'update'
      objectId: string
      fields: Record<string, unknown>
      clocks: FieldClocks
    }[] = []

    const currentObjects = objectsRef.current
    for (const [id, localClocks] of fieldClocksRef.current) {
      const dbClocks = dbClocksMap.get(id) ?? {}
      const localObj = currentObjects.get(id)
      if (!localObj) continue

      const winningFields: Record<string, unknown> = {}
      const winningClocks: FieldClocks = {}

      for (const [field, localClock] of Object.entries(localClocks)) {
        const dbClock = dbClocks[field]
        if (!dbClock || hlcGreaterThan(localClock, dbClock)) {
          const value = (localObj as unknown as Record<string, unknown>)[field]
          if (value !== undefined) {
            winningFields[field] = value
            winningClocks[field] = localClock
          }
        }
      }

      if (Object.keys(winningFields).length > 0) {
        localWins.push({
          action: 'update',
          objectId: id,
          fields: winningFields,
          clocks: winningClocks,
        })
      }
    }

    if (localWins.length > 0) {
      const { error: fnError } = await supabase.functions.invoke('merge-board-state', {
        body: { boardId, changes: localWins },
      })
      if (fnError) {
        console.error('Failed to reconcile on reconnect:', fnError.message)
      }
    }

    // Reload full state to get converged result.
    // loadObjects filters `deleted_at IS NULL`, which is correct because the
    // Edge Function's merge clears deleted_at for resurrected objects (add-wins).
    await loadObjects()
  }, [boardId, loadObjects])

  // Broadcast helper — sends changes to other clients.
  // Only send when the WebSocket is connected to avoid the REST fallback.
  // Monitors payload size and chunks if it exceeds the Supabase Realtime limit.
  const broadcastChanges = useCallback((changes: BoardChange[]) => {
    if (!channel) return
    if ((channel as unknown as { state: string }).state !== 'joined') return

    // sender_id is self-reported by the client. The channel uses `private: true`
    // so only authenticated users can join, but a malicious client could still
    // spoof another user's ID. This only affects cosmetic display (cursor color,
    // remote selection label) — all data mutations go through Supabase RLS.
    const payload = { changes, sender_id: userId }
    const serialized = JSON.stringify(payload)
    const byteSize = new TextEncoder().encode(serialized).byteLength

    if (byteSize <= BROADCAST_MAX_BYTES) {
      if (byteSize > BROADCAST_WARN_BYTES) {
        console.warn(`Broadcast payload near limit: ${(byteSize / 1024).toFixed(1)}KB`)
      }
      channel.send({ type: 'broadcast', event: 'board:sync', payload })
    } else {
      // Chunk: split changes into smaller payloads that fit under the limit
      const chunks: BoardChange[][] = []
      let current: BoardChange[] = []
      let currentSize = 0
      // Overhead for the wrapper: {"changes":[],"sender_id":"..."}
      const overhead = new TextEncoder().encode(JSON.stringify({ changes: [], sender_id: userId })).byteLength

      for (const change of changes) {
        const changeSize = new TextEncoder().encode(JSON.stringify(change)).byteLength + 1 // +1 for comma
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

  // Broadcast batching: coalesce outbound changes with flush-on-idle strategy.
  // A short idle timer (5ms) flushes quickly for single changes; a max timer (50ms)
  // caps latency during bursts.
  const pendingBroadcastRef = useRef<BoardChange[]>([])
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const queueBroadcast = useCallback((changes: BoardChange[]) => {
    const stamped = changes.map(c => ({ ...c, timestamp: c.timestamp ?? Date.now() }))
    pendingBroadcastRef.current.push(...stamped)

    // Clear any existing idle timer
    if (broadcastIdleTimerRef.current) {
      clearTimeout(broadcastIdleTimerRef.current)
    }

    // Set the max timer once per batch window
    if (!broadcastTimerRef.current) {
      broadcastTimerRef.current = setTimeout(flushBroadcast, BROADCAST_MAX_MS)
    }

    // Set a short idle timer — flushes early if no more changes arrive
    broadcastIdleTimerRef.current = setTimeout(flushBroadcast, BROADCAST_IDLE_MS)
  }, [flushBroadcast])

  // CRDT helper: tick clock, stamp changed fields, record clocks locally.
  // Returns the stamped clocks (or undefined if CRDT is disabled).
  const stampChange = useCallback((objectId: string, changedFields: string[]): FieldClocks | undefined => {
    if (!CRDT_ENABLED) return undefined
    hlcRef.current = tickHLC(hlcRef.current)
    const clocks = stampFields(changedFields, hlcRef.current)
    const existing = fieldClocksRef.current.get(objectId)
    fieldClocksRef.current.set(objectId, existing ? mergeClocks(existing, clocks) : clocks)
    return clocks
  }, [])

  // CRDT helper: stamp all fields of a new object
  const stampCreate = useCallback((objectId: string, obj: Partial<BoardObject>): FieldClocks | undefined => {
    if (!CRDT_ENABLED) return undefined
    hlcRef.current = tickHLC(hlcRef.current)
    const fields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by' && k !== 'created_at' && k !== 'updated_at')
    const clocks = stampFields(fields, hlcRef.current)
    fieldClocksRef.current.set(objectId, clocks)
    return clocks
  }, [])

  // Cleanup broadcast and receive timers on unmount
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

  // Listen for incoming object sync broadcasts.
  // Receive-side batching: collect incoming changes over a short window (10ms)
  // and apply them in a single setObjects call to reduce render churn.
  const incomingBatchRef = useRef<BoardChange[]>([])
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const RECEIVE_BATCH_MS = 10

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

  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: { changes: BoardChange[]; sender_id: string } }) => {
      if (payload.sender_id === userId) return

      // Advance local HLC from any remote clocks (synchronous, safe outside batch)
      if (CRDT_ENABLED) {
        for (const change of payload.changes) {
          if (change.clocks) {
            for (const remoteClock of Object.values(change.clocks)) {
              hlcRef.current = receiveHLC(hlcRef.current, remoteClock)
            }
          }
        }
      }

      // Collect into batch; flush after short coalescing window
      incomingBatchRef.current.push(...payload.changes)
      if (!incomingTimerRef.current) {
        incomingTimerRef.current = setTimeout(applyIncomingBatch, RECEIVE_BATCH_MS)
      }
    }

    channel.on('broadcast', { event: 'board:sync' }, handler)

    // No cleanup needed — Supabase channel listeners are removed when the
    // channel itself is removed (in useRealtimeChannel's cleanup).
  }, [channel, userId, applyIncomingBatch])

  // Helper: get max z_index
  const getMaxZIndex = useCallback(() => {
    let max = 0
    for (const obj of objects.values()) {
      if (obj.z_index > max) max = obj.z_index
    }
    return max
  }, [objects])

  // Helper: get min z_index
  const getMinZIndex = useCallback(() => {
    let min = Infinity
    for (const obj of objects.values()) {
      if (obj.z_index < min) min = obj.z_index
    }
    return min === Infinity ? 0 : min
  }, [objects])

  // Children index: parent_id -> direct children (O(N) build once, O(1) lookup)
  const childrenIndex = useMemo(() => {
    const index = new Map<string, BoardObject[]>()
    for (const obj of objects.values()) {
      if (obj.parent_id) {
        const siblings = index.get(obj.parent_id)
        if (siblings) {
          siblings.push(obj)
        } else {
          index.set(obj.parent_id, [obj])
        }
      }
    }
    return index
  }, [objects])

  // Cached frame list: only frames, sorted by z_index descending (highest first for hit-testing)
  const framesDesc = useMemo(() => {
    const frames: BoardObject[] = []
    for (const obj of objects.values()) {
      if (obj.type === 'frame') frames.push(obj)
    }
    frames.sort((a, b) => b.z_index - a.z_index)
    return frames
  }, [objects])

  // Helper: get children of a group/frame (O(1) lookup)
  const getChildren = useCallback((parentId: string): BoardObject[] => {
    return childrenIndex.get(parentId) ?? []
  }, [childrenIndex])

  // Helper: get all descendants recursively (O(descendants) instead of O(N * depth))
  const getDescendants = useCallback((parentId: string): BoardObject[] => {
    const result: BoardObject[] = []
    const stack = [parentId]
    while (stack.length > 0) {
      const pid = stack.pop()!
      const children = childrenIndex.get(pid)
      if (children) {
        for (const child of children) {
          result.push(child)
          stack.push(child.id)
        }
      }
    }
    return result
  }, [childrenIndex])

  // Helper: find the top-level ancestor (group/frame) that contains this object
  const getTopLevelAncestor = useCallback((id: string): string => {
    let current = objects.get(id)
    if (!current) return id
    while (current.parent_id) {
      const parent = objects.get(current.parent_id)
      if (!parent) break
      current = parent
    }
    return current.id
  }, [objects])

  const addObject = useCallback((
    type: BoardObjectType,
    x: number,
    y: number,
    overrides?: Partial<BoardObject>
  ) => {
    if (!canEdit) return null as unknown as BoardObject

    const id = uuidv4()
    const now = new Date().toISOString()

    // Build defaults from shape registry + manual entries for non-registry types
    const manualDefaults: Record<string, Partial<BoardObject>> = {
      sticky_note: { width: 150, height: 150, color: '#FFEB3B', text: '', font_size: 14, font_family: 'sans-serif', font_style: 'normal' },
      frame: { width: 400, height: 300, color: 'rgba(200,200,200,0.3)', text: 'Frame' },
      group: { width: 0, height: 0, color: 'transparent', text: '' },
      line: { width: 120, height: 2, color: '#374151', stroke_width: 2, stroke_dash: undefined },
      arrow: { width: 120, height: 40, color: '#F59E0B', stroke_width: 2, text: '' },
    }
    const def = shapeRegistry.get(type)
    const defaults: Record<string, Partial<BoardObject>> = {
      ...manualDefaults,
      ...(def ? { [type]: { width: def.defaultWidth, height: def.defaultHeight, color: def.defaultColor, ...def.defaultOverrides } } : {}),
    }

    // For vector types, compute x2/y2 from x + default width/height
    if (type === 'line' || type === 'arrow') {
      const dw = defaults[type]?.width ?? 120
      const dh = defaults[type]?.height ?? 0
      defaults[type] = { ...defaults[type], x2: x + dw, y2: y + dh }
    }

    const obj: BoardObject = {
      id,
      board_id: boardId,
      type,
      x,
      y,
      width: 150,
      height: 150,
      rotation: 0,
      text: '',
      color: '#FFEB3B',
      font_size: 14,
      z_index: getMaxZIndex() + 1,
      parent_id: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      ...defaults[type],
      ...overrides,
    }

    // Stamp clocks before insert so we can persist them
    const clocks = stampCreate(id, obj)

    setObjects(prev => {
      const next = new Map(prev)
      next.set(id, obj)
      return next
    })

    // Persist to Supabase, then broadcast on success
    const { id: _id, created_at, updated_at, field_clocks: _fc, deleted_at: _da, ...insertData } = obj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(id) ?? {} }
      : { ...insertData, id: obj.id }
    supabase
      .from('board_objects')
      .insert(insertRow)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to save object:', error.message)
          // Rollback optimistic update
          setObjects(prev => { const next = new Map(prev); next.delete(id); return next })
          fieldClocksRef.current.delete(id)
        } else {
          queueBroadcast([{ action: 'create', object: obj, clocks }])
        }
      })

    return obj
  }, [userId, boardId, canEdit, getMaxZIndex, queueBroadcast, stampCreate])

  const addObjectWithId = useCallback((obj: BoardObject) => {
    if (!canEdit) return

    const clocks = stampCreate(obj.id, obj)

    setObjects(prev => {
      const next = new Map(prev)
      next.set(obj.id, { ...obj, updated_at: new Date().toISOString() })
      return next
    })

    const { id: _id, created_at, updated_at, field_clocks: _fc, deleted_at: _da, ...insertData } = obj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
      : { ...insertData, id: obj.id }
    supabase
      .from('board_objects')
      .upsert(insertRow, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) {
          console.error('Failed to re-insert object:', error.message)
          setObjects(prev => { const next = new Map(prev); next.delete(obj.id); return next })
          fieldClocksRef.current.delete(obj.id)
        } else {
          queueBroadcast([{ action: 'create', object: obj, clocks }])
        }
      })
  }, [canEdit, queueBroadcast, stampCreate])

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return

    // Lock guard: block mutations on locked objects (except lock/unlock itself)
    if (!('locked_by' in updates)) {
      const obj = objectsRef.current.get(id)
      if (obj) {
        // Walk parent chain to check inherited locks
        let cur: BoardObject | undefined = obj
        while (cur) {
          if (cur.locked_by) return
          if (!cur.parent_id) break
          cur = objectsRef.current.get(cur.parent_id)
        }
      }
    }

    // Capture previous state for rollback
    const previousObj = objectsRef.current.get(id)

    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    // Stamp clocks for changed fields
    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)

    // Persist to Supabase, then broadcast on success
    const dbUpdate: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
    if (CRDT_ENABLED) {
      dbUpdate.field_clocks = fieldClocksRef.current.get(id) ?? {}
      dbUpdate.deleted_at = null // Clear tombstone — add-wins: any update resurrects
    }
    supabase
      .from('board_objects')
      .update(dbUpdate)
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to update object:', error.message)
          // Rollback optimistic update
          if (previousObj) {
            setObjects(prev => { const next = new Map(prev); next.set(id, previousObj); return next })
          }
        } else {
          queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
        }
      })
  }, [canEdit, queueBroadcast, stampChange])

  const deleteObject = useCallback(async (id: string) => {
    if (!canEdit) return

    // Lock guard: block deletion of locked objects
    const obj = objectsRef.current.get(id)
    if (obj) {
      let cur: BoardObject | undefined = obj
      while (cur) {
        if (cur.locked_by) return
        if (!cur.parent_id) break
        cur = objectsRef.current.get(cur.parent_id)
      }
    }

    // Also delete all descendants
    const descendants = getDescendants(id)
    const idsToDelete = [id, ...descendants.map(d => d.id)]

    // Stamp a delete clock (used for add-wins comparison on remote).
    // A single HLC tick covers the parent + all descendants — one user action at one causal point.
    const deleteClock = CRDT_ENABLED ? (() => {
      hlcRef.current = tickHLC(hlcRef.current)
      return hlcRef.current
    })() : undefined

    // Optimistic local update: remove from view (clocks retained for CRDT tombstone)
    setObjects(prev => {
      const next = new Map(prev)
      for (const did of idsToDelete) {
        next.delete(did)
      }
      return next
    })
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const did of idsToDelete) {
        next.delete(did)
      }
      return next
    })

    if (CRDT_ENABLED) {
      // Soft-delete: set deleted_at on all objects in parallel (tombstone)
      const now = new Date().toISOString()
      const results = await Promise.all(
        idsToDelete.map(did =>
          supabase.from('board_objects').update({ deleted_at: now }).eq('id', did)
        )
      )
      const failed = results.some(r => r.error)
      if (failed) {
        results.filter(r => r.error).forEach(r => console.error('Failed to soft-delete object:', r.error!.message))
      } else {
        queueBroadcast(idsToDelete.map(did => ({
          action: 'delete' as const,
          object: { id: did } as BoardObject,
          clocks: deleteClock ? { _deleted: deleteClock } : undefined,
        })))
      }
    } else {
      // Hard-delete: children first (parallel), then parent (FK constraint)
      const childIds = descendants.map(d => d.id)
      if (childIds.length > 0) {
        const childResults = await Promise.all(
          childIds.map(did => supabase.from('board_objects').delete().eq('id', did))
        )
        const childFailed = childResults.some(r => r.error)
        if (childFailed) {
          childResults.filter(r => r.error).forEach(r => console.error('Failed to delete object:', r.error!.message))
          return // Don't delete parent if children failed
        }
      }
      const { error } = await supabase.from('board_objects').delete().eq('id', id)
      if (error) {
        console.error('Failed to delete object:', error.message)
      } else {
        queueBroadcast(idsToDelete.map(did => ({ action: 'delete' as const, object: { id: did } as BoardObject })))
      }
    }
  }, [canEdit, getDescendants, queueBroadcast])


  const deleteSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      deleteObject(id)
    }
  }, [selectedIds, deleteObject, canEdit])

  const duplicateObject = useCallback((id: string) => {
    if (!canEdit) return null

    const original = objects.get(id)
    if (!original) return null

    // If it's a group, duplicate group + all descendants
    if (original.type === 'group' || original.type === 'frame') {
      const descendants = getDescendants(id)
      const idMap = new Map<string, string>() // old id -> new id
      const groupId = uuidv4()
      idMap.set(id, groupId)
      for (const d of descendants) {
        idMap.set(d.id, uuidv4())
      }

      const now = new Date().toISOString()
      const newObjects: BoardObject[] = []

      // Clone the group/frame itself
      newObjects.push({
        ...original,
        id: groupId,
        x: original.x + 20,
        y: original.y + 20,
        z_index: getMaxZIndex() + 1,
        parent_id: original.parent_id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      })

      // Clone descendants
      for (const d of descendants) {
        const cloned: BoardObject = {
          ...d,
          id: idMap.get(d.id)!,
          x: d.x + 20,
          y: d.y + 20,
          z_index: d.z_index,
          parent_id: d.parent_id ? idMap.get(d.parent_id) ?? null : null,
          created_by: userId,
          created_at: now,
          updated_at: now,
        }
        if (d.x2 != null) cloned.x2 = d.x2 + 20
        if (d.y2 != null) cloned.y2 = d.y2 + 20
        newObjects.push(cloned)
      }

      setObjects(prev => {
        const next = new Map(prev)
        for (const obj of newObjects) {
          next.set(obj.id, obj)
        }
        return next
      })

      queueBroadcast(newObjects.map(obj => ({
        action: 'create' as const,
        object: obj,
        clocks: stampCreate(obj.id, obj),
      })))

      // Persist: insert parent first (await), then children
      const parentObj = newObjects[0]
      const childObjs = newObjects.slice(1)
      const { id: _pid, created_at: _pca, updated_at: _pua, field_clocks: _pfc, deleted_at: _pda, ...parentInsert } = parentObj
      const parentRow = CRDT_ENABLED
        ? { ...parentInsert, id: parentObj.id, field_clocks: fieldClocksRef.current.get(parentObj.id) ?? {} }
        : { ...parentInsert, id: parentObj.id }
      supabase
        .from('board_objects')
        .insert(parentRow)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to save duplicated parent:', error.message)
            return
          }
          // Now safe to insert children
          for (const obj of childObjs) {
            const { id: _cid, created_at: _cca, updated_at: _cua, field_clocks: _cfc, deleted_at: _cda, ...childInsert } = obj
            const childRow = CRDT_ENABLED
              ? { ...childInsert, id: obj.id, field_clocks: fieldClocksRef.current.get(obj.id) ?? {} }
              : { ...childInsert, id: obj.id }
            supabase
              .from('board_objects')
              .insert(childRow)
              .then(({ error: childErr }) => {
                if (childErr) console.error('Failed to save duplicated child:', childErr.message)
              })
          }
        })

      setSelectedIds(new Set([groupId]))
      return newObjects[0]
    }

    // Simple object duplication — clone all visual properties
    const { id: _oid, board_id: _obid, created_by: _ocb, created_at: _oca, updated_at: _oua, field_clocks: _ofc, deleted_at: _oda, type: _otype, x: _ox, y: _oy, z_index: _oz, ...visualProps } = original
    const dupOverrides: Partial<BoardObject> = { ...visualProps }
    // Copy endpoints for vector types with +20 offset
    if (original.x2 != null) dupOverrides.x2 = original.x2 + 20
    if (original.y2 != null) dupOverrides.y2 = original.y2 + 20
    const newObj = addObject(original.type, original.x + 20, original.y + 20, dupOverrides)
    if (newObj) setSelectedIds(new Set([newObj.id]))
    return newObj
  }, [objects, addObject, canEdit, getDescendants, getMaxZIndex, userId, queueBroadcast, stampCreate])

  const duplicateSelected = useCallback((): string[] => {
    if (!canEdit) return []
    const ids = Array.from(selectedIds)
    if (ids.length === 1) {
      const newObj = duplicateObject(ids[0])
      return newObj ? [newObj.id] : []
    } else if (ids.length > 1) {
      const newIds: string[] = []
      for (const id of ids) {
        const newObj = duplicateObject(id)
        if (newObj) newIds.push(newObj.id)
      }
      setSelectedIds(new Set(newIds))
      return newIds
    }
    return []
  }, [selectedIds, duplicateObject, canEdit])

  // Selection
  const selectObject = useCallback((id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => {
    if (id === null) {
      setSelectedIds(new Set())
      setActiveGroupId(null)
      return
    }

    const obj = objects.get(id)

    // If the shape belongs to a group/frame, single-click always selects the
    // top-level container (even if we're currently inside the group).
    // Individual shape selection only happens via double-click (enterGroup).
    if (obj?.parent_id) {
      const parent = objects.get(obj.parent_id)
      if (parent && (parent.type === 'group' || parent.type === 'frame')) {
        // Exit group mode if we were inside
        setActiveGroupId(null)
        const topId = getTopLevelAncestor(id)
        if (opts?.shift) {
          setSelectedIds(prev => new Set([...prev, topId]))
        } else if (opts?.ctrl) {
          setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(topId)) next.delete(topId)
            else next.add(topId)
            return next
          })
        } else {
          setSelectedIds(new Set([topId]))
        }
        return
      }
    }

    if (opts?.shift) {
      setSelectedIds(prev => new Set([...prev, id]))
    } else if (opts?.ctrl) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedIds(new Set([id]))
      setActiveGroupId(null)
    }
  }, [objects, activeGroupId, getTopLevelAncestor])

  const selectObjects = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setActiveGroupId(null)
  }, [])

  // Enter group mode (double-click on a group/frame).
  // Optionally select a specific child shape immediately.
  const enterGroup = useCallback((groupId: string, selectChildId?: string) => {
    const obj = objects.get(groupId)
    if (!obj || (obj.type !== 'group' && obj.type !== 'frame')) return
    setActiveGroupId(groupId)
    setSelectedIds(selectChildId ? new Set([selectChildId]) : new Set())
  }, [objects])

  // Exit group mode
  const exitGroup = useCallback(() => {
    setActiveGroupId(null)
    setSelectedIds(new Set())
  }, [])

  // Helper: get all IDs that should move together (object + descendants if group/frame)
  const getZOrderSet = useCallback((id: string): BoardObject[] => {
    const obj = objects.get(id)
    if (!obj) return []
    if (obj.type === 'group' || obj.type === 'frame') {
      return [obj, ...getDescendants(id)]
    }
    return [obj]
  }, [objects, getDescendants])

  // Z-ordering — batched: single setObjects + single queueBroadcast + parallel DB updates.
  // Uses .update() instead of .upsert() because these objects already exist and the
  // INSERT RLS policy requires board_id/created_by which aren't in the z-index patch.
  const persistZIndexBatch = useCallback((updates: { id: string; z_index: number }[], now: string) => {
    Promise.all(updates.map(u => {
      const patch: Record<string, unknown> = { z_index: u.z_index, updated_at: now }
      if (CRDT_ENABLED) {
        patch.field_clocks = fieldClocksRef.current.get(u.id) ?? {}
        patch.deleted_at = null
      }
      return supabase.from('board_objects').update(patch).eq('id', u.id)
    })).then(results => {
      for (const { error } of results) {
        if (error) console.error('Failed to update z_index:', error.message)
      }
    })
  }, [])

  const bringToFront = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const maxZ = getMaxZIndex()
    const minInSet = Math.min(...set.map(o => o.z_index))
    const delta = maxZ - minInSet + 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index + delta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index + delta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [canEdit, getZOrderSet, getMaxZIndex, queueBroadcast, persistZIndexBatch, stampChange])

  const sendToBack = useCallback((id: string) => {
    if (!canEdit) return
    const set = getZOrderSet(id)
    if (set.length === 0) return
    const minZ = getMinZIndex()
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const delta = maxInSet - minZ + 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index - delta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index - delta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [canEdit, getZOrderSet, getMinZIndex, queueBroadcast, persistZIndexBatch, stampChange])

  const bringForward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const maxInSet = Math.max(...set.map(o => o.z_index))
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => a.z_index - b.z_index)
    const nextHigher = sorted.find(o => o.z_index > maxInSet)
    if (!nextHigher) return

    const nextSet = getZOrderSet(nextHigher.id)
    const maxNext = Math.max(...nextSet.map(o => o.z_index))
    const fwdDelta = maxNext - maxInSet
    const bwdDelta = set.length > 1 ? maxInSet - Math.min(...set.map(s => s.z_index)) + 1 : 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index + fwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    for (const o of nextSet) {
      const newZ = o.z_index - bwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index + fwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      for (const o of nextSet) {
        const newZ = o.z_index - bwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [objects, canEdit, getZOrderSet, queueBroadcast, persistZIndexBatch, stampChange])

  const sendBackward = useCallback((id: string) => {
    if (!canEdit) return
    const obj = objects.get(id)
    if (!obj) return
    const set = getZOrderSet(id)
    const minInSet = Math.min(...set.map(o => o.z_index))
    const setIds = new Set(set.map(o => o.id))
    const sorted = Array.from(objects.values())
      .filter(o => !setIds.has(o.id) && o.parent_id === obj.parent_id)
      .sort((a, b) => b.z_index - a.z_index)
    const nextLower = sorted.find(o => o.z_index < minInSet)
    if (!nextLower) return

    const nextSet = getZOrderSet(nextLower.id)
    const minNext = Math.min(...nextSet.map(o => o.z_index))
    const bwdDelta = minInSet - minNext
    const fwdDelta = set.length > 1 ? Math.max(...set.map(s => s.z_index)) - minInSet + 1 : 1

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    const dbUpdates: { id: string; z_index: number }[] = []
    for (const o of set) {
      const newZ = o.z_index - bwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    for (const o of nextSet) {
      const newZ = o.z_index + fwdDelta
      const clocks = stampChange(o.id, ['z_index'])
      changes.push({ action: 'update', object: { id: o.id, z_index: newZ }, clocks })
      dbUpdates.push({ id: o.id, z_index: newZ })
    }
    setObjects(prev => {
      const next = new Map(prev)
      for (const o of set) {
        const newZ = o.z_index - bwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      for (const o of nextSet) {
        const newZ = o.z_index + fwdDelta
        const existing = next.get(o.id)
        if (existing) next.set(o.id, { ...existing, z_index: newZ, updated_at: now })
      }
      return next
    })
    queueBroadcast(changes)
    persistZIndexBatch(dbUpdates, now)
  }, [objects, canEdit, getZOrderSet, queueBroadcast, persistZIndexBatch, stampChange])

  // Group selected objects
  const groupSelected = useCallback(async () => {
    if (!canEdit || selectedIds.size < 2) return null
    const ids = Array.from(selectedIds)
    const selectedObjs = ids.map(id => objects.get(id)).filter(Boolean) as BoardObject[]
    if (selectedObjs.length < 2) return null

    const groupId = uuidv4()
    const now = new Date().toISOString()
    const groupObj: BoardObject = {
      id: groupId,
      board_id: boardId,
      type: 'group',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      text: '',
      color: 'transparent',
      font_size: 14,
      z_index: Math.max(...selectedObjs.map(o => o.z_index)),
      parent_id: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    }

    // Optimistic local update: add group + set parent_id on children
    setObjects(prev => {
      const next = new Map(prev)
      next.set(groupId, groupObj)
      for (const obj of selectedObjs) {
        const existing = next.get(obj.id)
        if (existing) {
          next.set(obj.id, { ...existing, parent_id: groupId, updated_at: now })
        }
      }
      return next
    })
    setSelectedIds(new Set([groupId]))

    queueBroadcast([
      { action: 'create', object: groupObj, clocks: stampCreate(groupId, groupObj) },
      ...selectedObjs.map(obj => ({
        action: 'update' as const,
        object: { id: obj.id, parent_id: groupId } as Partial<BoardObject> & { id: string },
        clocks: stampChange(obj.id, ['parent_id']),
      })),
    ])

    // Persist: insert group first, then update children
    const { id: _id, created_at, updated_at, field_clocks: _fc, deleted_at: _da, ...insertData } = groupObj
    const insertRow = CRDT_ENABLED
      ? { ...insertData, id: groupId, field_clocks: fieldClocksRef.current.get(groupId) ?? {} }
      : { ...insertData, id: groupId }
    const { error: insertError } = await supabase
      .from('board_objects')
      .insert(insertRow)
    if (insertError) {
      console.error('Failed to save group:', insertError.message)
      return null
    }

    for (const obj of selectedObjs) {
      const childUpdate: Record<string, unknown> = { parent_id: groupId, updated_at: now }
      if (CRDT_ENABLED) {
        childUpdate.field_clocks = fieldClocksRef.current.get(obj.id) ?? {}
        childUpdate.deleted_at = null
      }
      supabase
        .from('board_objects')
        .update(childUpdate)
        .eq('id', obj.id)
        .then(({ error }) => {
          if (error) console.error('Failed to update child parent_id:', error.message)
        })
    }

    return groupObj
  }, [canEdit, selectedIds, objects, boardId, userId, queueBroadcast, stampCreate, stampChange])

  // Ungroup: dissolve a group, freeing its children
  const ungroupSelected = useCallback(() => {
    if (!canEdit) return
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'group') continue
      const children = getChildren(id)
      for (const child of children) {
        updateObject(child.id, { parent_id: obj.parent_id })
      }
      // Remove the group object from local state
      setObjects(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })

      if (CRDT_ENABLED) {
        // Soft-delete: stamp a delete clock for add-wins comparison on remote.
        // A single HLC tick covers the whole ungroup — one user action at one causal point.
        hlcRef.current = tickHLC(hlcRef.current)
        const deleteClock = hlcRef.current
        // Do NOT clear fieldClocksRef — allows add-wins resurrection
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject, clocks: { _deleted: deleteClock } }])
        supabase
          .from('board_objects')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error('Failed to soft-delete group:', error.message)
          })
      } else {
        // Legacy: hard-delete from DB
        fieldClocksRef.current.delete(id)
        queueBroadcast([{ action: 'delete', object: { id } as BoardObject }])
        supabase
          .from('board_objects')
          .delete()
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error('Failed to delete group:', error.message)
          })
      }
    }
    setSelectedIds(new Set())
  }, [canEdit, selectedIds, objects, getChildren, updateObject, queueBroadcast])

  // Move group/frame: move all children by delta (batched — single state update + single broadcast)
  const moveGroupChildren = useCallback((parentId: string, dx: number, dy: number, skipDb = false) => {
    if (!canEdit) return
    const descendants = getDescendants(parentId)
    if (descendants.length === 0) return

    const now = new Date().toISOString()
    const changes: BoardChange[] = []
    // Helper: translate absolute waypoints by (dx, dy)
    const translateWaypoints = (wp: string | null | undefined): string | null => {
      if (!wp) return null
      try {
        const pts: number[] = JSON.parse(wp)
        if (!Array.isArray(pts) || pts.length < 2 || pts.length % 2 !== 0) return null
        const translated: number[] = []
        for (let i = 0; i < pts.length; i += 2) {
          translated.push(pts[i] + dx, pts[i + 1] + dy)
        }
        return JSON.stringify(translated)
      } catch { return null }
    }

    for (const d of descendants) {
      const hasEndpoints = d.x2 != null && d.y2 != null
      const fields = hasEndpoints ? ['x', 'y', 'x2', 'y2'] : ['x', 'y']
      if (d.waypoints) fields.push('waypoints')
      const clocks = stampChange(d.id, fields)
      const update: Partial<BoardObject> & { id: string } = { id: d.id, x: d.x + dx, y: d.y + dy }
      if (hasEndpoints) { update.x2 = d.x2! + dx; update.y2 = d.y2! + dy }
      if (d.waypoints) { update.waypoints = translateWaypoints(d.waypoints) }
      changes.push({ action: 'update', object: update, clocks })
    }

    setObjects(prev => {
      const next = new Map(prev)
      for (const d of descendants) {
        const existing = next.get(d.id)
        if (existing) {
          const updated = { ...existing, x: existing.x + dx, y: existing.y + dy, updated_at: now }
          if (existing.x2 != null) updated.x2 = existing.x2 + dx
          if (existing.y2 != null) updated.y2 = existing.y2 + dy
          if (existing.waypoints) updated.waypoints = translateWaypoints(existing.waypoints)
          next.set(d.id, updated)
        }
      }
      return next
    })

    queueBroadcast(changes)

    if (!skipDb) {
      Promise.all(descendants.map(d => {
        const patch: Record<string, unknown> = { x: d.x + dx, y: d.y + dy, updated_at: now }
        if (d.x2 != null) patch.x2 = d.x2 + dx
        if (d.y2 != null) patch.y2 = d.y2 + dy
        if (d.waypoints) patch.waypoints = translateWaypoints(d.waypoints)
        if (CRDT_ENABLED) {
          patch.field_clocks = fieldClocksRef.current.get(d.id) ?? {}
          patch.deleted_at = null
        }
        return supabase.from('board_objects').update(patch).eq('id', d.id)
      })).then(results => {
        for (const { error } of results) {
          if (error) console.error('Failed to update child position:', error.message)
        }
      })
    }
  }, [canEdit, getDescendants, queueBroadcast, stampChange])

  // Drag-specific updates: local state + broadcast only (no DB write)
  const updateObjectDrag = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return

    // Lock guard
    const obj = objectsRef.current.get(id)
    if (obj) {
      let cur: BoardObject | undefined = obj
      while (cur) {
        if (cur.locked_by) return
        if (!cur.parent_id) break
        cur = objectsRef.current.get(cur.parent_id)
      }
    }

    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)
    queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])
  }, [canEdit, queueBroadcast, stampChange])

  // Drag end: local state + DB write + broadcast
  const updateObjectDragEnd = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return

    // Lock guard
    const lockObj = objectsRef.current.get(id)
    if (lockObj) {
      let cur: BoardObject | undefined = lockObj
      while (cur) {
        if (cur.locked_by) return
        if (!cur.parent_id) break
        cur = objectsRef.current.get(cur.parent_id)
      }
    }

    const now = new Date().toISOString()
    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: now })
      return next
    })

    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    const clocks = stampChange(id, changedFields)
    queueBroadcast([{ action: 'update', object: { id, ...updates }, clocks }])

    const dbUpdate: Record<string, unknown> = { ...updates, updated_at: now }
    if (CRDT_ENABLED) {
      dbUpdate.field_clocks = fieldClocksRef.current.get(id) ?? {}
      dbUpdate.deleted_at = null
    }
    supabase
      .from('board_objects')
      .update(dbUpdate)
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to update object:', error.message)
      })
  }, [canEdit, queueBroadcast, stampChange])

  // Frame containment: check if an object should be inside a frame after drag.
  // Uses memoized framesDesc (sorted z_index desc) so we can short-circuit on first hit.
  const checkFrameContainment = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || obj.type === 'frame') return

    // For vector types, use midpoint of endpoints
    let centerX: number, centerY: number
    if (obj.x2 != null && obj.y2 != null) {
      centerX = (obj.x + obj.x2) / 2
      centerY = (obj.y + obj.y2) / 2
    } else {
      centerX = obj.x + obj.width / 2
      centerY = obj.y + obj.height / 2
    }

    // Find the highest-z frame containing this object's center.
    // framesDesc is sorted by z_index descending, so the first match is the best.
    let bestFrame: BoardObject | null = null
    for (const frame of framesDesc) {
      if (frame.id === id) continue
      if (
        centerX >= frame.x &&
        centerX <= frame.x + frame.width &&
        centerY >= frame.y &&
        centerY <= frame.y + frame.height
      ) {
        bestFrame = frame
        break
      }
    }

    const newParentId = bestFrame?.id ?? null
    if (obj.parent_id !== newParentId) {
      // Only update parent if the parent is a frame (don't break group membership)
      const currentParent = obj.parent_id ? objects.get(obj.parent_id) : null
      if (!currentParent || currentParent.type === 'frame') {
        updateObject(id, { parent_id: newParentId })
      }
    }
  }, [objects, framesDesc, updateObject])

  // Lock helpers: check if an object is locked (directly or via ancestor inheritance)
  const isObjectLocked = useCallback((id: string): boolean => {
    let current = objectsRef.current.get(id)
    while (current) {
      if (current.locked_by) return true
      if (!current.parent_id) break
      current = objectsRef.current.get(current.parent_id)
    }
    return false
  }, [])

  const lockObject = useCallback((id: string) => {
    if (!canEdit) return
    updateObject(id, { locked_by: userId })
  }, [canEdit, userId, updateObject])

  const unlockObject = useCallback((id: string) => {
    if (!canEdit) return
    updateObject(id, { locked_by: null })
  }, [canEdit, updateObject])

  // Broadcast local selection changes to remote users (debounced)
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

  // Batched remote selection updates (10ms window to coalesce rapid changes)
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
        selectionFlushTimerRef.current = setTimeout(flushSelections, 10)
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

  // Clean up remote selections when a user leaves (no longer in onlineUsers)
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

  // Computed: sorted objects by z_index
  const sortedObjects = useMemo(() => {
    return Array.from(objects.values()).sort((a, b) => a.z_index - b.z_index)
  }, [objects])

  return {
    objects,
    selectedIds,
    activeGroupId,
    sortedObjects,
    addObject,
    updateObject,
    deleteSelected,
    duplicateSelected,
    selectObject,
    selectObjects,
    clearSelection,
    enterGroup,
    exitGroup,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    groupSelected,
    ungroupSelected,
    moveGroupChildren,
    updateObjectDrag,
    updateObjectDragEnd,
    checkFrameContainment,
    getChildren,
    getDescendants,
    remoteSelections,
    reconcileOnReconnect,
    COLOR_PALETTE,
    deleteObject,
    getZOrderSet,
    addObjectWithId,
    duplicateObject,
    isObjectLocked,
    lockObject,
    unlockObject,
  }
}
