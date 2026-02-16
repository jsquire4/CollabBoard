export type BoardObjectType =
  | 'sticky_note'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'frame'
  | 'connector'
  | 'text'

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
  from_id: string | null
  to_id: string | null
  connector_style: string
  created_by: string
  created_at: string
  updated_at: string
}

export type CreateBoardObject = Omit<BoardObject, 'id' | 'created_at' | 'updated_at'>
