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
  | 'table'
  | 'file'

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bold italic'

// TipTap rich text JSON types
export interface TipTapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  marks?: TipTapMark[]
  content?: TipTapNode[]
  text?: string
}

export interface TipTapDoc {
  type: 'doc'
  content: TipTapNode[]
}

export type MarkerType = 'none' | 'arrow' | 'arrow_open' | 'circle' | 'circle_open' | 'square' | 'diamond' | 'diamond_open' | 'bar'

// BoardObject is now composed from sub-interfaces in boardObject.ts
export type { BoardObject } from './boardObject'
export type {
  BoardObjectIdentity,
  BoardObjectGeometry,
  BoardObjectHierarchy,
  BoardObjectText,
  BoardObjectAppearance,
  BoardObjectConnector,
  BoardObjectPolygon,
  BoardObjectTable,
  BoardObjectFile,
  BoardObjectCollab,
  VectorObject,
  TableObject,
  FileObject,
  GenericShapeObject,
} from './boardObject'
