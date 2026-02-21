'use client'

import { createContext, useContext } from 'react'
import type React from 'react'
import type { BoardObject, BoardObjectType, MarkerType } from '@/types/board'
import type { Editor } from '@tiptap/react'
import type { RemoteCursorData } from '@/hooks/useCursors'

export interface BoardMutationsContextValue {
  // Drawing
  onDrawShape: (type: BoardObjectType, x: number, y: number, width: number, height: number) => void
  onCancelTool: () => void

  // Selection
  onSelect: (id: string | null, opts?: { shift?: boolean; ctrl?: boolean }) => void
  onSelectObjects: (ids: string[]) => void
  onClearSelection: () => void
  onEnterGroup: (groupId: string, selectChildId?: string) => void
  onExitGroup: () => void

  // Drag
  onDragStart: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onDragMove: (id: string, x: number, y: number) => void

  // Text
  onUpdateText: (id: string, text: string) => void
  onUpdateTitle: (id: string, title: string) => void
  onUpdateRichText?: (id: string, json: string, before: { text: string; rich_text: string | null }) => void
  onEditorReady?: (editor: Editor) => void

  // Transform
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void

  // Clipboard
  onDelete: () => void
  onDuplicate: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void

  // Style
  onColorChange: (color: string) => void
  onTextColorChange: (color: string) => void
  onStrokeStyleChange: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange: (opacity: number) => void
  onMarkerChange: (updates: { marker_start?: MarkerType; marker_end?: MarkerType }) => void

  // Z-order
  onBringToFront: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onSendToBack: (id: string) => void

  // Groups
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean

  // Undo
  onUndo: () => void
  onRedo: () => void

  // Frame containment
  onCheckFrameContainment: (id: string) => void
  onMoveGroupChildren: (parentId: string, dx: number, dy: number, skipDb?: boolean) => void

  // Colors
  recentColors: string[]
  colors: string[]
  selectedColor?: string

  // Connectors
  onEndpointDragMove: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd: (id: string, updates: Partial<BoardObject>) => void
  onDrawLineFromAnchor: (type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => void

  // Cursor
  onCursorMove: (x: number, y: number) => void
  onCursorUpdate: (fn: (cursors: Map<string, RemoteCursorData>) => void) => void
  isDraggingRef: React.MutableRefObject<boolean>
  lastDragCursorPosRef: React.MutableRefObject<{ x: number; y: number } | null>
  sendCursorDirect: (x: number, y: number) => void

  // Editing state
  onEditingChange: (isEditing: boolean) => void

  // Lock
  anySelectedLocked: boolean
  onLock: () => void
  onUnlock: () => void
  canLock: boolean
  canUnlock: boolean

  // Vertices
  onEditVertices: () => void
  onExitVertexEdit: () => void
  onVertexDragEnd: (id: string, index: number, x: number, y: number) => void
  onVertexInsert: (id: string, afterIndex: number) => void
  canEditVertices: boolean

  // Activity
  onActivity: () => void

  // Pending edit
  pendingEditId: string | null
  onPendingEditConsumed: () => void

  // Waypoints
  onWaypointDragEnd: (id: string, waypointIndex: number, x: number, y: number) => void
  onWaypointInsert: (id: string, afterSegmentIndex: number) => void
  onWaypointDelete: (id: string, waypointIndex: number) => void

  // Auto-route
  autoRoutePointsRef: React.MutableRefObject<Map<string, number[]>>

  // Table
  onUpdateTableCell: (id: string, row: number, col: number, text: string) => void
  onTableDataChange: (id: string, tableData: string) => void
  onAddRow: () => void
  onDeleteRow: () => void
  onAddColumn: () => void
  onDeleteColumn: () => void
  onAddRowAt: (id: string, beforeIndex: number) => void
  onDeleteRowAt: (id: string, rowIndex: number) => void
  onAddColumnAt: (id: string, beforeIndex: number) => void
  onDeleteColumnAt: (id: string, colIndex: number) => void

  // Snap indicator
  snapIndicator: { x: number; y: number } | null

  // Vertex edit
  vertexEditId: string | null
  onAgentClick?: (id: string) => void
  onApiConfigChange?: (id: string, formula: string) => void
  onCommentOpen?: (id: string) => void
}

const BoardMutationsContext = createContext<BoardMutationsContextValue | null>(null)

export interface BoardMutationsProviderProps {
  value: BoardMutationsContextValue
  children: React.ReactNode
}

export function BoardMutationsProvider({ value, children }: BoardMutationsProviderProps) {
  return (
    <BoardMutationsContext.Provider value={value}>
      {children}
    </BoardMutationsContext.Provider>
  )
}

export function useBoardMutations(): BoardMutationsContextValue {
  const ctx = useContext(BoardMutationsContext)
  if (ctx === null) {
    throw new Error('useBoardMutations must be used within a BoardMutationsProvider')
  }
  return ctx
}
