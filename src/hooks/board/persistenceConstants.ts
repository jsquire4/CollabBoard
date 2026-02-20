import React from 'react'
import { BoardObject } from '@/types/board'
import { CRDT_ENABLED } from '@/hooks/board/useBroadcast'

// Explicit column list for board_objects queries (avoids pulling large JSONB when not needed)
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
].join(',')

export const BOARD_OBJECT_SELECT = CRDT_ENABLED
  ? BOARD_OBJECT_COLUMNS + ',field_clocks'
  : BOARD_OBJECT_COLUMNS

/**
 * Convert JSONB string fields (table_data, rich_text) to parsed objects so
 * Postgres stores them as JSONB objects rather than scalar string values.
 * String fields that are null/undefined are passed through unchanged.
 */
/** Walk parent chain to check if object is locked (directly or via ancestor). */
export function checkLocked(objectsRef: React.RefObject<Map<string, BoardObject>>, id: string): boolean {
  let current = objectsRef.current.get(id)
  while (current) {
    if (current.locked_by) return true
    if (!current.parent_id) break
    current = objectsRef.current.get(current.parent_id)
  }
  return false
}

export function toJsonbPayload(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  if (typeof out.table_data === 'string') {
    try { out.table_data = JSON.parse(out.table_data) } catch { /* leave as-is */ }
  }
  if (typeof out.rich_text === 'string') {
    try { out.rich_text = JSON.parse(out.rich_text) } catch { /* leave as-is */ }
  }
  return out
}
