import type { FieldClocks } from './lib/crdt.js'

export type BoardObjectType =
  | 'sticky_note'
  | 'rectangle'
  | 'circle'
  | 'frame'
  | 'group'
  | 'line'
  | 'triangle'
  | 'chevron'
  | 'arrow'
  | 'parallelogram'
  | 'ngon'
  | 'table'
  | 'file'

export interface BoardObject {
  id: string
  board_id: string
  type: BoardObjectType
  x: number
  y: number
  x2?: number | null
  y2?: number | null
  width: number
  height: number
  rotation: number
  text: string
  color: string
  font_size: number
  font_family?: string
  font_style?: string
  stroke_width?: number
  stroke_dash?: string | null
  z_index: number
  parent_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  stroke_color?: string | null
  opacity?: number | null
  title?: string | null
  rich_text?: string | null
  locked_by?: string | null
  sides?: number | null
  custom_points?: string | null
  connect_start_id?: string | null
  connect_start_anchor?: string | null
  connect_end_id?: string | null
  connect_end_anchor?: string | null
  waypoints?: string | null
  marker_start?: string | null
  marker_end?: string | null
  table_data?: string | null
  corner_radius?: number | null
  text_align?: string | null
  text_vertical_align?: string | null
  text_padding?: number | null
  text_color?: string | null
  shadow_color?: string | null
  shadow_blur?: number | null
  shadow_offset_x?: number | null
  shadow_offset_y?: number | null
  storage_path?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
  field_clocks?: FieldClocks
  deleted_at?: string | null
}

export interface BoardMessage {
  id: string
  board_id: string
  frame_id?: string | null
  role: 'user' | 'assistant' | 'system'
  user_id?: string | null
  content: string
  tool_calls?: unknown
  created_at: string
}

export interface TipTapDoc {
  type: 'doc'
  content: TipTapNode[]
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: TipTapNode[]
  text?: string
}

// ── Table types (inlined from src/lib/table/tableTypes.ts) ──

export interface TableCell {
  text: string
  bg_color?: string
  text_color?: string
  font_style?: 'normal' | 'bold' | 'italic' | 'bold italic'
}

export interface TableColumn {
  id: string
  name: string
  width: number
}

export interface TableRow {
  id: string
  height: number
  cells: Record<string, TableCell>
}

export interface TableData {
  columns: TableColumn[]
  rows: TableRow[]
  header_bg?: string
  header_text_color?: string
}
