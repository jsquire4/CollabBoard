'use client'

import { createContext, useContext } from 'react'
import type React from 'react'
import type Konva from 'konva'
import { BoardObject, BoardObjectType } from '@/types/board'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'

// ── Context value ────────────────────────────────────────────────────

export interface BoardContextValue {
  // Board state (from useBoardState)
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  activeGroupId: string | null
  sortedObjects: BoardObject[]
  remoteSelections: Map<string, Set<string>>
  getChildren: (parentId: string) => BoardObject[]
  getDescendants: (parentId: string) => BoardObject[]

  // Board identity
  boardId: string

  // User & permissions
  userId: string
  userRole: BoardRole
  canEdit: boolean

  // Tool state (from BoardClient)
  activeTool: BoardObjectType | null

  // Presence
  onlineUsers: OnlineUser[]

  // Lock queries
  isObjectLocked: (id: string) => boolean

  // Grid & canvas settings
  gridSize: number
  gridSubdivisions: number
  gridVisible: boolean
  snapToGrid: boolean
  gridStyle: string
  canvasColor: string
  gridColor: string
  subdivisionColor: string
  uiDarkMode: boolean
  commentCounts: Map<string, number>

  // Drag overlay (ref-based, no re-render cost)
  dragPositionsRef: React.MutableRefObject<Map<string, Partial<BoardObject>>>

  // Shape node registry for imperative Konva updates (connectors during drag)
  shapeRefs: React.MutableRefObject<Map<string, Konva.Node>>

  // Canvas viewport (lifted from useCanvas so top bar can show zoom controls)
  stagePos: { x: number; y: number }
  setStagePos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  stageScale: number
  setStageScale: React.Dispatch<React.SetStateAction<number>>
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

// ── Context ──────────────────────────────────────────────────────────

const BoardContext = createContext<BoardContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────

export function BoardProvider({
  value,
  children,
}: {
  value: BoardContextValue
  children: React.ReactNode
}) {
  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  )
}

// ── Consumer hook ────────────────────────────────────────────────────

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext)
  if (!ctx) {
    throw new Error('useBoardContext must be used within a BoardProvider')
  }
  return ctx
}
