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
  z_index: number
  parent_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}
