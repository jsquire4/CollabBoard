'use client'

import { useReducer, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fireAndRetry } from '@/lib/retryWithRollback'
import { logger } from '@/lib/logger'
import { toast } from 'sonner'
import { BoardSettingsUpdate } from '@/components/board/gridConstants'

type GridStyle = 'lines' | 'dots' | 'both'

interface GridSettingsState {
  gridSize: number
  gridSubdivisions: number
  gridVisible: boolean
  snapToGrid: boolean
  gridStyle: GridStyle
  canvasColor: string
  gridColor: string
  subdivisionColor: string
}

type GridSettingsUpdates = BoardSettingsUpdate

function gridSettingsReducer(state: GridSettingsState, updates: GridSettingsUpdates): GridSettingsState {
  return {
    gridSize: updates.grid_size ?? state.gridSize,
    gridSubdivisions: updates.grid_subdivisions ?? state.gridSubdivisions,
    gridVisible: updates.grid_visible ?? state.gridVisible,
    snapToGrid: updates.snap_to_grid ?? state.snapToGrid,
    gridStyle: updates.grid_style ?? state.gridStyle,
    canvasColor: updates.canvas_color ?? state.canvasColor,
    gridColor: updates.grid_color ?? state.gridColor,
    subdivisionColor: updates.subdivision_color ?? state.subdivisionColor,
  }
}

interface UseGridSettingsParams {
  boardId: string
  initialGridSize: number
  initialGridSubdivisions: number
  initialGridVisible: boolean
  initialSnapToGrid: boolean
  initialGridStyle: GridStyle
  initialCanvasColor: string
  initialGridColor: string
  initialSubdivisionColor: string
}

export function useGridSettings(params: UseGridSettingsParams): {
  gridSize: number
  gridSubdivisions: number
  gridVisible: boolean
  snapToGrid: boolean
  gridStyle: GridStyle
  canvasColor: string
  gridColor: string
  subdivisionColor: string
  updateBoardSettings: (updates: GridSettingsUpdates) => void
} {
  const {
    boardId,
    initialGridSize,
    initialGridSubdivisions,
    initialGridVisible,
    initialSnapToGrid,
    initialGridStyle,
    initialCanvasColor,
    initialGridColor,
    initialSubdivisionColor,
  } = params

  const [state, dispatch] = useReducer(gridSettingsReducer, {
    gridSize: initialGridSize,
    gridSubdivisions: initialGridSubdivisions,
    gridVisible: initialGridVisible,
    snapToGrid: initialSnapToGrid,
    gridStyle: initialGridStyle,
    canvasColor: initialCanvasColor,
    gridColor: initialGridColor,
    subdivisionColor: initialSubdivisionColor,
  })

  const supabaseRef = useRef(createClient())

  const updateBoardSettings = useCallback((updates: GridSettingsUpdates) => {
    dispatch(updates)
    // Persist to DB (fire-and-forget with retry)
    fireAndRetry({
      operation: () => supabaseRef.current.from('boards').update(updates).eq('id', boardId),
      logError: (err) => logger.error({ message: 'Failed to save board settings', operation: 'updateBoardSettings', boardId, error: err }),
      onError: (msg) => toast.error(msg),
    })
  }, [boardId])

  return {
    gridSize: state.gridSize,
    gridSubdivisions: state.gridSubdivisions,
    gridVisible: state.gridVisible,
    snapToGrid: state.snapToGrid,
    gridStyle: state.gridStyle,
    canvasColor: state.canvasColor,
    gridColor: state.gridColor,
    subdivisionColor: state.subdivisionColor,
    updateBoardSettings,
  }
}
