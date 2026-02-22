import React from 'react'
import type Konva from 'konva'
import { BoardObject } from '@/types/board'

// Universal callbacks that every shape needs
export interface BaseShapeCallbacks {
  handleShapeDragEnd: (id: string, x: number, y: number) => void
  handleShapeDragMove: (id: string, x: number, y: number) => void
  handleShapeDragStart: (id: string) => void
  handleShapeSelect: (id: string) => void
  handleShapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  handleContextMenu: (id: string, clientX: number, clientY: number) => void
  handleShapeDoubleClick: (id: string) => void
  handleStartEdit: (id: string, textNode: Konva.Text | null, field?: 'title' | 'text') => void
  shapeDragBoundFunc?: (pos: { x: number; y: number }) => { x: number; y: number }
}

// Additional callbacks for line/arrow shapes
export interface VectorShapeCallbacks {
  onEndpointDragMove: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd: (id: string, updates: Partial<BoardObject>) => void
  onWaypointDragEnd: (id: string, waypointIndex: number, x: number, y: number) => void
  onWaypointInsert: (id: string, afterSegmentIndex: number) => void
  onWaypointDelete: (id: string, waypointIndex: number) => void
  getAutoRoutePoints: (obj: BoardObject) => number[] | null
  autoRoutePointsRef: React.MutableRefObject<Map<string, number[]>>
}

// Additional callbacks for table shapes
export interface TableShapeCallbacks {
  handleStartCellEdit: (id: string, textNode: Konva.Text, row: number, col: number) => void
  handleTableDataChange: (id: string, tableData: string) => void
  handleAddRowAt: (id: string, beforeIndex: number) => void
  handleDeleteRowAt: (id: string, rowIndex: number) => void
  handleAddColumnAt: (id: string, beforeIndex: number) => void
  handleDeleteColumnAt: (id: string, colIndex: number) => void
}

// Additional callbacks for agent shapes
export interface AgentShapeCallbacks {
  onAgentClick?: (id: string) => void
}

// Combined type for backward compat
export type ShapeCallbacks = BaseShapeCallbacks & Partial<VectorShapeCallbacks> & Partial<TableShapeCallbacks> & Partial<AgentShapeCallbacks>

export interface ShapeState {
  selectedIds: Set<string>
  isObjectLocked: (id: string) => boolean
  canEdit: boolean
  editingId: string | null
  editingField?: 'title' | 'text'
  editingCellCoords?: { row: number; col: number } | null
}
