import { useRef, useCallback } from 'react'
import { BoardObject } from '@/types/board'

export type UndoEntry =
  | { type: 'add'; ids: string[] }
  | { type: 'delete'; objects: BoardObject[] }
  | { type: 'update'; patches: { id: string; before: Partial<BoardObject> }[] }
  | { type: 'move'; patches: { id: string; before: { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null } }[] }
  | { type: 'group'; groupId: string; childIds: string[]; previousParentIds: Map<string, string | null> }
  | { type: 'ungroup'; groupSnapshot: BoardObject; childIds: string[] }
  | { type: 'duplicate'; ids: string[] }

const MAX_STACK_SIZE = 50

export function useUndoStack() {
  const undoRef = useRef<UndoEntry[]>([])
  const redoRef = useRef<UndoEntry[]>([])

  const push = useCallback((entry: UndoEntry) => {
    undoRef.current.push(entry)
    if (undoRef.current.length > MAX_STACK_SIZE) {
      undoRef.current.shift()
    }
    redoRef.current = []
  }, [])

  const popUndo = useCallback((): UndoEntry | undefined => {
    return undoRef.current.pop()
  }, [])

  const popRedo = useCallback((): UndoEntry | undefined => {
    return redoRef.current.pop()
  }, [])

  const pushRedo = useCallback((entry: UndoEntry) => {
    redoRef.current.push(entry)
    if (redoRef.current.length > MAX_STACK_SIZE) {
      redoRef.current.shift()
    }
  }, [])

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoRef.current.push(entry)
    if (undoRef.current.length > MAX_STACK_SIZE) {
      undoRef.current.shift()
    }
  }, [])

  return { push, popUndo, popRedo, pushRedo, pushUndo }
}
