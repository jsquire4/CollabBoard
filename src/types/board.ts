export interface Board {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

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

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bold italic'

export interface BoardObject {
  id: string
  board_id: string
  type: BoardObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  text: string
  color: string
  font_size: number
  font_family?: string
  font_style?: FontStyle
  stroke_width?: number
  stroke_dash?: string // JSON array e.g. "[5,5]"
  z_index: number
  parent_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  field_clocks?: Record<string, { ts: number; c: number; n: string }>
  deleted_at?: string | null
}
