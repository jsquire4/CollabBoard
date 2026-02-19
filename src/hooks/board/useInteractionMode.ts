import { useReducer, useCallback } from 'react'

// --- Interaction mode discriminated union ---

export type InteractionMode =
  | { type: 'idle' }
  | { type: 'panning'; startX: number; startY: number; stagePos: { x: number; y: number }; didPan: boolean }
  | { type: 'marquee'; startX: number; startY: number }
  | { type: 'drawing'; startX: number; startY: number; snapStart: { shapeId: string; anchorId: string; x: number; y: number } | null; isConnectorHint: boolean }

// --- Actions ---

export type InteractionAction =
  | { type: 'START_PAN'; startX: number; startY: number; stagePos: { x: number; y: number } }
  | { type: 'PAN_MOVED' }
  | { type: 'END_PAN' }
  | { type: 'START_MARQUEE'; startX: number; startY: number }
  | { type: 'END_MARQUEE' }
  | { type: 'START_DRAW'; startX: number; startY: number; snapStart: { shapeId: string; anchorId: string; x: number; y: number } | null; isConnectorHint: boolean }
  | { type: 'END_DRAW' }
  | { type: 'RESET' }

// --- Reducer ---

export const IDLE: InteractionMode = { type: 'idle' }

export function interactionReducer(state: InteractionMode, action: InteractionAction): InteractionMode {
  switch (action.type) {
    case 'START_PAN':
      if (state.type !== 'idle') return state
      return { type: 'panning', startX: action.startX, startY: action.startY, stagePos: action.stagePos, didPan: false }

    case 'PAN_MOVED':
      if (state.type !== 'panning') return state
      if (state.didPan) return state // already set
      return { ...state, didPan: true }

    case 'END_PAN':
      if (state.type !== 'panning') return state
      return IDLE

    case 'START_MARQUEE':
      if (state.type !== 'idle') return state
      return { type: 'marquee', startX: action.startX, startY: action.startY }

    case 'END_MARQUEE':
      if (state.type !== 'marquee') return state
      return IDLE

    case 'START_DRAW':
      if (state.type !== 'idle') return state
      return { type: 'drawing', startX: action.startX, startY: action.startY, snapStart: action.snapStart, isConnectorHint: action.isConnectorHint }

    case 'END_DRAW':
      if (state.type !== 'drawing') return state
      return IDLE

    case 'RESET':
      return IDLE

    default:
      return state
  }
}

// --- Type guards / derived helpers ---

export function isIdle(mode: InteractionMode): mode is { type: 'idle' } {
  return mode.type === 'idle'
}

export function isPanning(mode: InteractionMode): mode is Extract<InteractionMode, { type: 'panning' }> {
  return mode.type === 'panning'
}

export function isMarquee(mode: InteractionMode): mode is Extract<InteractionMode, { type: 'marquee' }> {
  return mode.type === 'marquee'
}

export function isDrawing(mode: InteractionMode): mode is Extract<InteractionMode, { type: 'drawing' }> {
  return mode.type === 'drawing'
}

// --- Hook ---

export function useInteractionMode() {
  const [mode, dispatch] = useReducer(interactionReducer, IDLE)

  const startPan = useCallback((startX: number, startY: number, stagePos: { x: number; y: number }) => {
    dispatch({ type: 'START_PAN', startX, startY, stagePos })
  }, [])

  const panMoved = useCallback(() => {
    dispatch({ type: 'PAN_MOVED' })
  }, [])

  const endPan = useCallback(() => {
    dispatch({ type: 'END_PAN' })
  }, [])

  const startMarquee = useCallback((startX: number, startY: number) => {
    dispatch({ type: 'START_MARQUEE', startX, startY })
  }, [])

  const endMarquee = useCallback(() => {
    dispatch({ type: 'END_MARQUEE' })
  }, [])

  const startDraw = useCallback((startX: number, startY: number, snapStart: { shapeId: string; anchorId: string; x: number; y: number } | null, isConnectorHint: boolean) => {
    dispatch({ type: 'START_DRAW', startX, startY, snapStart, isConnectorHint })
  }, [])

  const endDraw = useCallback(() => {
    dispatch({ type: 'END_DRAW' })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return {
    mode,
    dispatch,
    startPan,
    panMoved,
    endPan,
    startMarquee,
    endMarquee,
    startDraw,
    endDraw,
    reset,
  }
}
