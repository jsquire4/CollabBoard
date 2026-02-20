/**
 * Board state management for the agent container.
 * Loads board objects from Supabase, subscribes to Realtime for live updates,
 * and provides an in-memory cache for tool reads.
 */

import { supabase } from './lib/supabase.js'
import type { BoardObject, BoardMessage } from './types.js'
import type { FieldClocks } from './lib/crdt.js'
import { mergeFields } from './lib/crdt.js'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface BoardState {
  boardId: string
  objects: Map<string, BoardObject>
  fieldClocks: Map<string, FieldClocks>
  messages: BoardMessage[]
  channel: RealtimeChannel | null
}

// ── Broadcast to client channel via HTTP API ────────────────

export interface BoardChange {
  action: 'create' | 'update' | 'delete'
  object: Partial<BoardObject> & { id: string }
  timestamp?: number
}

const AGENT_SENDER_ID = '__agent__'
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function broadcastChanges(boardId: string, changes: BoardChange[]) {
  // Fire-and-forget HTTP broadcast via Supabase Realtime API
  fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        topic: `board:${boardId}`,
        event: 'board:sync',
        payload: { changes, sender_id: AGENT_SENDER_ID },
        private: true,
      }],
    }),
  }).catch(err => {
    console.error(`[state] Broadcast failed for board ${boardId}:`, err)
  })
}

const boards = new Map<string, BoardState>()
const loadingPromises = new Map<string, Promise<BoardState>>()

// ── Column list matching usePersistence.ts BOARD_OBJECT_COLUMNS ──

const BOARD_OBJECT_COLUMNS = [
  'id', 'board_id', 'type', 'x', 'y', 'x2', 'y2', 'width', 'height', 'rotation',
  'text', 'color', 'font_size', 'font_family', 'font_style',
  'stroke_width', 'stroke_dash', 'stroke_color',
  'opacity', 'shadow_color', 'shadow_blur', 'shadow_offset_x', 'shadow_offset_y',
  'text_align', 'text_vertical_align', 'text_padding', 'text_color',
  'corner_radius', 'title', 'rich_text', 'locked_by',
  'sides', 'custom_points',
  'connect_start_id', 'connect_start_anchor', 'connect_end_id', 'connect_end_anchor', 'waypoints',
  'marker_start', 'marker_end', 'table_data',
  'storage_path', 'file_name', 'mime_type', 'file_size',
  'z_index', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  'field_clocks',
].join(',')

// ── Load ────────────────────────────────────────────────────

export async function loadBoardState(boardId: string): Promise<BoardState> {
  const existing = boards.get(boardId)
  if (existing) return existing

  // Deduplicate concurrent loads for the same board
  const pending = loadingPromises.get(boardId)
  if (pending) return pending

  const promise = loadBoardStateImpl(boardId)
  loadingPromises.set(boardId, promise)
  try {
    return await promise
  } finally {
    loadingPromises.delete(boardId)
  }
}

async function loadBoardStateImpl(boardId: string): Promise<BoardState> {
  const [objectsResult, messagesResult] = await Promise.all([
    supabase
      .from('board_objects')
      .select(BOARD_OBJECT_COLUMNS)
      .eq('board_id', boardId)
      .is('deleted_at', null)
      .limit(5000),
    supabase
      .from('board_messages')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true })
      .limit(200),
  ])

  if (objectsResult.error) {
    throw new Error(`Failed to load board objects: ${objectsResult.error.message}`)
  }
  if (messagesResult.error) {
    throw new Error(`Failed to load board messages: ${messagesResult.error.message}`)
  }

  const objects = new Map<string, BoardObject>()
  const fieldClocks = new Map<string, FieldClocks>()

  for (const obj of (objectsResult.data as unknown as BoardObject[] ?? [])) {
    objects.set(obj.id, obj)
    if (obj.field_clocks && typeof obj.field_clocks === 'object') {
      fieldClocks.set(obj.id, obj.field_clocks as FieldClocks)
    }
  }

  const state: BoardState = {
    boardId,
    objects,
    fieldClocks,
    messages: (messagesResult.data ?? []) as BoardMessage[],
    channel: null,
  }

  // Subscribe before storing — minimize the window for missed events
  subscribeToChanges(state)
  boards.set(boardId, state)

  return state
}

// ── Realtime subscription ───────────────────────────────────

function subscribeToChanges(state: BoardState) {
  const channel = supabase
    .channel(`agent-board-${state.boardId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'board_objects',
        filter: `board_id=eq.${state.boardId}`,
      },
      (payload) => {
        const record = payload.new as BoardObject | undefined
        const oldRecord = payload.old as { id: string } | undefined

        if (payload.eventType === 'DELETE' && oldRecord) {
          state.objects.delete(oldRecord.id)
          state.fieldClocks.delete(oldRecord.id)
          return
        }

        if (!record) return

        if (record.deleted_at) {
          state.objects.delete(record.id)
          state.fieldClocks.delete(record.id)
          return
        }

        const existing = state.objects.get(record.id)
        if (existing && record.field_clocks) {
          const localClocks = state.fieldClocks.get(record.id) ?? {}
          const remoteClocks = record.field_clocks as FieldClocks
          const { merged, clocks } = mergeFields(
            existing as unknown as Record<string, unknown>,
            localClocks,
            record as unknown as Record<string, unknown>,
            remoteClocks,
          )
          state.objects.set(record.id, merged as unknown as BoardObject)
          state.fieldClocks.set(record.id, clocks)
        } else {
          state.objects.set(record.id, record)
          if (record.field_clocks) {
            state.fieldClocks.set(record.id, record.field_clocks as FieldClocks)
          }
        }
      },
    )
    .subscribe()

  state.channel = channel
}

// ── Get state (for tools) ───────────────────────────────────

export function getBoardStateSync(boardId: string): BoardState | undefined {
  return boards.get(boardId)
}

export function getMaxZIndex(boardId: string): number {
  const state = boards.get(boardId)
  if (!state) return 0
  let max = 0
  for (const obj of state.objects.values()) {
    if (obj.z_index > max) max = obj.z_index
  }
  return max
}

// ── Cleanup ─────────────────────────────────────────────────

export async function cleanupBoardState(boardId: string) {
  const state = boards.get(boardId)
  if (!state) return
  if (state.channel) {
    await supabase.removeChannel(state.channel)
  }
  boards.delete(boardId)
}

export async function cleanupAllBoards() {
  for (const boardId of boards.keys()) {
    await cleanupBoardState(boardId)
  }
}
