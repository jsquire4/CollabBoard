'use client'

import { createContext, useContext } from 'react'
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
