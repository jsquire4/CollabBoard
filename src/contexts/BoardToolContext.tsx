'use client'

import { createContext, useContext } from 'react'
import { BoardObjectType } from '@/types/board'
import type { ShapePreset } from '@/components/board/shapePresets'

export interface BoardToolContextValue {
  activePreset: ShapePreset | null
  setActiveTool: (tool: BoardObjectType | null) => void
  setActivePreset: (preset: ShapePreset | null) => void
}

const BoardToolContext = createContext<BoardToolContextValue | null>(null)

export function BoardToolProvider({ value, children }: { value: BoardToolContextValue; children: React.ReactNode }) {
  return <BoardToolContext.Provider value={value}>{children}</BoardToolContext.Provider>
}

export function useBoardToolContext(): BoardToolContextValue {
  const ctx = useContext(BoardToolContext)
  if (!ctx) throw new Error('useBoardToolContext must be used within a BoardToolProvider')
  return ctx
}
