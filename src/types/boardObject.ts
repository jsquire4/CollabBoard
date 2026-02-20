import type { HLC } from '@/lib/crdt/hlc'
import type { BoardObjectType, FontStyle } from './board'

// --- Sub-interfaces ---

export interface BoardObjectIdentity {
  id: string
  board_id: string
  type: BoardObjectType
  created_by: string
  created_at: string
  updated_at: string
}

export interface BoardObjectGeometry {
  x: number
  y: number
  x2?: number | null
  y2?: number | null
  width: number
  height: number
  rotation: number
}

export interface BoardObjectHierarchy {
  z_index: number
  parent_id: string | null
}

export interface BoardObjectText {
  text: string
  title?: string | null
  rich_text?: string | null // JSON-serialized TipTapDoc
  font_size: number
  font_family?: string
  font_style?: FontStyle
  text_align?: string | null
  text_vertical_align?: string | null
  text_padding?: number | null
  text_color?: string | null
}

export interface BoardObjectAppearance {
  color: string
  stroke_color?: string | null
  stroke_width?: number
  stroke_dash?: string // JSON array e.g. "[5,5]"
  opacity?: number | null
  corner_radius?: number | null
  shadow_color?: string | null
  shadow_blur?: number | null
  shadow_offset_x?: number | null
  shadow_offset_y?: number | null
}

export interface BoardObjectConnector {
  connect_start_id?: string | null
  connect_start_anchor?: string | null
  connect_end_id?: string | null
  connect_end_anchor?: string | null
  waypoints?: string | null
  marker_start?: string | null
  marker_end?: string | null
}

export interface BoardObjectPolygon {
  sides?: number | null
  custom_points?: string | null
}

export interface BoardObjectTable {
  table_data?: string | null
}

export interface BoardObjectFile {
  storage_path?: string | null
  file_name?: string | null
  mime_type?: string | null
  file_size?: number | null
}

export interface BoardObjectCollab {
  locked_by?: string | null
  field_clocks?: Record<string, HLC>
  deleted_at?: string | null
}

// --- Composed type ---

export type BoardObject =
  BoardObjectIdentity &
  BoardObjectGeometry &
  BoardObjectHierarchy &
  BoardObjectText &
  BoardObjectAppearance &
  BoardObjectConnector &
  BoardObjectPolygon &
  BoardObjectTable &
  BoardObjectFile &
  BoardObjectCollab
