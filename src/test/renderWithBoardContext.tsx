import React from 'react'
import { BoardProvider, BoardContextValue } from '@/contexts/BoardContext'
import { BoardMutationsProvider, BoardMutationsContextValue } from '@/contexts/BoardMutationsContext'
import { BoardToolProvider, BoardToolContextValue } from '@/contexts/BoardToolContext'

const defaultBoardValue: BoardContextValue = {
  objects: new Map(),
  selectedIds: new Set(),
  activeGroupId: null,
  sortedObjects: [],
  remoteSelections: new Map(),
  getChildren: () => [],
  getDescendants: () => [],
  userId: 'test-user',
  userRole: 'editor',
  canEdit: true,
  activeTool: null,
  onlineUsers: [],
  isObjectLocked: () => false,
  gridSize: 40,
  gridSubdivisions: 1,
  gridVisible: true,
  snapToGrid: false,
  gridStyle: 'lines',
  canvasColor: '#e8ecf1',
  gridColor: '#b4becd',
  subdivisionColor: '#b4becd',
  uiDarkMode: false,
}

function noop() {}
const mutationsRef = { current: new Map<string, number[]>() }

const defaultMutationsValue: BoardMutationsContextValue = {
  onDrawShape: noop,
  onCancelTool: noop,
  onSelect: noop,
  onSelectObjects: noop,
  onClearSelection: noop,
  onEnterGroup: noop,
  onExitGroup: noop,
  onDragStart: noop,
  onDragEnd: noop,
  onDragMove: noop,
  onUpdateText: noop,
  onUpdateTitle: noop,
  onTransformEnd: noop,
  onDelete: noop,
  onDuplicate: noop,
  onCopy: noop,
  onPaste: noop,
  onColorChange: noop,
  onStrokeStyleChange: noop,
  onOpacityChange: noop,
  onMarkerChange: noop,
  onBringToFront: noop,
  onBringForward: noop,
  onSendBackward: noop,
  onSendToBack: noop,
  onGroup: noop,
  onUngroup: noop,
  canGroup: false,
  canUngroup: false,
  onUndo: noop,
  onRedo: noop,
  onCheckFrameContainment: noop,
  onMoveGroupChildren: noop,
  recentColors: [],
  colors: ['#4A90D9', '#EF4444', '#22C55E', '#EAB308', '#6366f1', '#ec4899'],
  onEndpointDragMove: noop,
  onEndpointDragEnd: noop,
  onDrawLineFromAnchor: noop,
  onCursorMove: noop,
  onCursorUpdate: noop,
  onEditingChange: noop,
  anySelectedLocked: false,
  onLock: noop,
  onUnlock: noop,
  canLock: false,
  canUnlock: false,
  onEditVertices: noop,
  onExitVertexEdit: noop,
  onVertexDragEnd: noop,
  onVertexInsert: noop,
  canEditVertices: false,
  onActivity: noop,
  pendingEditId: null,
  onPendingEditConsumed: noop,
  onWaypointDragEnd: noop,
  onWaypointInsert: noop,
  onWaypointDelete: noop,
  autoRoutePointsRef: mutationsRef,
  onUpdateTableCell: noop,
  onTableDataChange: noop,
  onAddRow: noop,
  onDeleteRow: noop,
  onAddColumn: noop,
  onDeleteColumn: noop,
  onAddRowAt: noop,
  onDeleteRowAt: noop,
  onAddColumnAt: noop,
  onDeleteColumnAt: noop,
  snapIndicator: null,
  vertexEditId: null,
}

const defaultToolValue: BoardToolContextValue = {
  activePreset: null,
  setActiveTool: noop,
  setActivePreset: noop,
}

export interface RenderWithBoardContextOptions {
  boardValue?: Partial<BoardContextValue>
  mutationsValue?: Partial<BoardMutationsContextValue>
  toolValue?: Partial<BoardToolContextValue>
}

export function createBoardContextWrapper(options: RenderWithBoardContextOptions = {}) {
  const boardValue: BoardContextValue = { ...defaultBoardValue, ...options.boardValue }
  const mutationsValue: BoardMutationsContextValue = {
    ...defaultMutationsValue,
    ...options.mutationsValue,
  }
  const toolValue: BoardToolContextValue = { ...defaultToolValue, ...options.toolValue }

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BoardProvider value={boardValue}>
        <BoardMutationsProvider value={mutationsValue}>
          <BoardToolProvider value={toolValue}>{children}</BoardToolProvider>
        </BoardMutationsProvider>
      </BoardProvider>
    )
  }
}
