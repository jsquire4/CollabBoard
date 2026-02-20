/**
 * Stateless per-request board state loader for Vercel serverless routes.
 * Unlike the container version, there is no in-memory cache or Realtime subscription —
 * each request loads fresh data from Supabase.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { BoardObject } from '@/types/board'
import type { FieldClocks } from '@/lib/crdt/merge'

export interface BoardState {
  boardId: string
  objects: Map<string, BoardObject>
  fieldClocks: Map<string, FieldClocks>
}

export interface BoardChange {
  action: 'create' | 'update' | 'delete'
  object: Partial<BoardObject> & { id: string }
  timestamp?: number
}

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
  'agent_state', 'agent_session_id', 'source_agent_id', 'model',
  'file_id', 'formula', 'is_slide', 'slide_index', 'deck_id',
  'z_index', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  'field_clocks',
].join(',')

const AGENT_SENDER_ID = '__agent__'

export async function loadBoardState(boardId: string): Promise<BoardState> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('board_objects')
    .select(BOARD_OBJECT_COLUMNS)
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .limit(5000)

  if (error) {
    throw new Error(`Failed to load board objects: ${error.message}`)
  }

  const objects = new Map<string, BoardObject>()
  const fieldClocks = new Map<string, FieldClocks>()

  for (const obj of (data as unknown as BoardObject[] ?? [])) {
    objects.set(obj.id, obj)
    if (obj.field_clocks && typeof obj.field_clocks === 'object') {
      fieldClocks.set(obj.id, obj.field_clocks as FieldClocks)
    }
  }

  return { boardId, objects, fieldClocks }
}

export function getMaxZIndex(state: BoardState): number {
  let max = 0
  for (const obj of state.objects.values()) {
    if (obj.z_index > max) max = obj.z_index
  }
  return max
}

export function broadcastChanges(boardId: string, changes: BoardChange[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceKey) return

  fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
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
    console.error(`[boardState] Broadcast failed for board ${boardId}:`, err)
  })
}
