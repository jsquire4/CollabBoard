export interface Board {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  grid_size: number
  grid_subdivisions: number
  grid_visible: boolean
  snap_to_grid: boolean
  grid_style: string
  canvas_color: string
  grid_color: string
  subdivision_color: string
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
  | 'ngon'

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bold italic'

export type MarkerType = 'none' | 'arrow' | 'arrow_open' | 'circle' | 'circle_open' | 'square' | 'diamond' | 'diamond_open' | 'bar'

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
  font_style?: FontStyle
  stroke_width?: number
  stroke_dash?: string // JSON array e.g. "[5,5]"
  z_index: number
  parent_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  stroke_color?: string | null
  opacity?: number | null
  shadow_color?: string | null
  shadow_blur?: number | null
  shadow_offset_x?: number | null
  shadow_offset_y?: number | null
  text_align?: string | null
  text_vertical_align?: string | null
  text_padding?: number | null
  text_color?: string | null
  corner_radius?: number | null
  title?: string | null
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
  field_clocks?: Record<string, import('@/lib/crdt/hlc').HLC>
  deleted_at?: string | null
}
