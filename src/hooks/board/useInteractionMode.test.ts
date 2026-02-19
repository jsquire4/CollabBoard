import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  interactionReducer,
  IDLE,
  isIdle,
  isPanning,
  isMarquee,
  isDrawing,
  useInteractionMode,
  InteractionMode,
  InteractionAction,
} from './useInteractionMode'

describe('interactionReducer (pure function)', () => {
  describe('START_PAN', () => {
    it('transitions from idle to panning', () => {
      const result = interactionReducer(IDLE, {
        type: 'START_PAN',
        startX: 100,
        startY: 200,
        stagePos: { x: 0, y: 0 },
      })
      expect(result.type).toBe('panning')
      if (result.type === 'panning') {
        expect(result.startX).toBe(100)
        expect(result.startY).toBe(200)
        expect(result.didPan).toBe(false)
      }
    })

    it('ignores START_PAN when already panning', () => {
      const panning: InteractionMode = { type: 'panning', startX: 50, startY: 50, stagePos: { x: 0, y: 0 }, didPan: false }
      const result = interactionReducer(panning, {
        type: 'START_PAN',
        startX: 100,
        startY: 200,
        stagePos: { x: 0, y: 0 },
      })
      expect(result).toBe(panning) // same reference
    })

    it('ignores START_PAN when drawing', () => {
      const drawing: InteractionMode = { type: 'drawing', startX: 0, startY: 0, snapStart: null, isConnectorHint: false }
      const result = interactionReducer(drawing, {
        type: 'START_PAN',
        startX: 100,
        startY: 200,
        stagePos: { x: 0, y: 0 },
      })
      expect(result).toBe(drawing)
    })

    it('ignores START_PAN when marquee is active', () => {
      const marquee: InteractionMode = { type: 'marquee', startX: 0, startY: 0 }
      const result = interactionReducer(marquee, {
        type: 'START_PAN',
        startX: 100,
        startY: 200,
        stagePos: { x: 0, y: 0 },
      })
      expect(result).toBe(marquee)
    })
  })

  describe('PAN_MOVED', () => {
    it('sets didPan to true', () => {
      const panning: InteractionMode = { type: 'panning', startX: 50, startY: 50, stagePos: { x: 0, y: 0 }, didPan: false }
      const result = interactionReducer(panning, { type: 'PAN_MOVED' })
      expect(result.type).toBe('panning')
      if (result.type === 'panning') expect(result.didPan).toBe(true)
    })

    it('is a no-op when already didPan', () => {
      const panning: InteractionMode = { type: 'panning', startX: 50, startY: 50, stagePos: { x: 0, y: 0 }, didPan: true }
      const result = interactionReducer(panning, { type: 'PAN_MOVED' })
      expect(result).toBe(panning)
    })

    it('ignores PAN_MOVED when idle', () => {
      const result = interactionReducer(IDLE, { type: 'PAN_MOVED' })
      expect(result).toBe(IDLE)
    })
  })

  describe('END_PAN', () => {
    it('transitions from panning to idle', () => {
      const panning: InteractionMode = { type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: true }
      const result = interactionReducer(panning, { type: 'END_PAN' })
      expect(isIdle(result)).toBe(true)
    })

    it('ignores END_PAN when not panning', () => {
      const result = interactionReducer(IDLE, { type: 'END_PAN' })
      expect(result).toBe(IDLE)
    })
  })

  describe('START_MARQUEE', () => {
    it('transitions from idle to marquee', () => {
      const result = interactionReducer(IDLE, { type: 'START_MARQUEE', startX: 10, startY: 20 })
      expect(result.type).toBe('marquee')
      if (result.type === 'marquee') {
        expect(result.startX).toBe(10)
        expect(result.startY).toBe(20)
      }
    })

    it('ignores START_MARQUEE when drawing', () => {
      const drawing: InteractionMode = { type: 'drawing', startX: 0, startY: 0, snapStart: null, isConnectorHint: false }
      const result = interactionReducer(drawing, { type: 'START_MARQUEE', startX: 10, startY: 20 })
      expect(result).toBe(drawing)
    })
  })

  describe('END_MARQUEE', () => {
    it('transitions from marquee to idle', () => {
      const marquee: InteractionMode = { type: 'marquee', startX: 10, startY: 20 }
      const result = interactionReducer(marquee, { type: 'END_MARQUEE' })
      expect(isIdle(result)).toBe(true)
    })

    it('ignores END_MARQUEE when not in marquee', () => {
      const panning: InteractionMode = { type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: false }
      const result = interactionReducer(panning, { type: 'END_MARQUEE' })
      expect(result).toBe(panning)
    })
  })

  describe('START_DRAW', () => {
    it('transitions from idle to drawing with snap data', () => {
      const snap = { shapeId: 's1', anchorId: 'top', x: 50, y: 0 }
      const result = interactionReducer(IDLE, {
        type: 'START_DRAW',
        startX: 50,
        startY: 0,
        snapStart: snap,
        isConnectorHint: false,
      })
      expect(result.type).toBe('drawing')
      if (result.type === 'drawing') {
        expect(result.snapStart).toEqual(snap)
        expect(result.isConnectorHint).toBe(false)
      }
    })

    it('supports connector hint mode', () => {
      const result = interactionReducer(IDLE, {
        type: 'START_DRAW',
        startX: 0,
        startY: 0,
        snapStart: null,
        isConnectorHint: true,
      })
      if (result.type === 'drawing') {
        expect(result.isConnectorHint).toBe(true)
      }
    })

    it('ignores START_DRAW when panning', () => {
      const panning: InteractionMode = { type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: false }
      const result = interactionReducer(panning, {
        type: 'START_DRAW',
        startX: 0,
        startY: 0,
        snapStart: null,
        isConnectorHint: false,
      })
      expect(result).toBe(panning)
    })
  })

  describe('END_DRAW', () => {
    it('transitions from drawing to idle', () => {
      const drawing: InteractionMode = { type: 'drawing', startX: 0, startY: 0, snapStart: null, isConnectorHint: false }
      const result = interactionReducer(drawing, { type: 'END_DRAW' })
      expect(isIdle(result)).toBe(true)
    })

    it('ignores END_DRAW when not drawing', () => {
      const result = interactionReducer(IDLE, { type: 'END_DRAW' })
      expect(result).toBe(IDLE)
    })
  })

  describe('RESET', () => {
    it('returns idle from any state', () => {
      const panning: InteractionMode = { type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: true }
      expect(isIdle(interactionReducer(panning, { type: 'RESET' }))).toBe(true)

      const marquee: InteractionMode = { type: 'marquee', startX: 0, startY: 0 }
      expect(isIdle(interactionReducer(marquee, { type: 'RESET' }))).toBe(true)

      const drawing: InteractionMode = { type: 'drawing', startX: 0, startY: 0, snapStart: null, isConnectorHint: false }
      expect(isIdle(interactionReducer(drawing, { type: 'RESET' }))).toBe(true)
    })
  })
})

describe('type guard helpers', () => {
  it('isIdle', () => {
    expect(isIdle(IDLE)).toBe(true)
    expect(isIdle({ type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: false })).toBe(false)
  })

  it('isPanning', () => {
    expect(isPanning({ type: 'panning', startX: 0, startY: 0, stagePos: { x: 0, y: 0 }, didPan: false })).toBe(true)
    expect(isPanning(IDLE)).toBe(false)
  })

  it('isMarquee', () => {
    expect(isMarquee({ type: 'marquee', startX: 0, startY: 0 })).toBe(true)
    expect(isMarquee(IDLE)).toBe(false)
  })

  it('isDrawing', () => {
    expect(isDrawing({ type: 'drawing', startX: 0, startY: 0, snapStart: null, isConnectorHint: false })).toBe(true)
    expect(isDrawing(IDLE)).toBe(false)
  })
})

describe('mutual exclusion invariants', () => {
  it('cannot enter drawing while panning', () => {
    let state: InteractionMode = IDLE
    state = interactionReducer(state, { type: 'START_PAN', startX: 0, startY: 0, stagePos: { x: 0, y: 0 } })
    state = interactionReducer(state, { type: 'START_DRAW', startX: 0, startY: 0, snapStart: null, isConnectorHint: false })
    expect(state.type).toBe('panning')
  })

  it('cannot enter marquee while drawing', () => {
    let state: InteractionMode = IDLE
    state = interactionReducer(state, { type: 'START_DRAW', startX: 0, startY: 0, snapStart: null, isConnectorHint: false })
    state = interactionReducer(state, { type: 'START_MARQUEE', startX: 0, startY: 0 })
    expect(state.type).toBe('drawing')
  })

  it('cannot enter panning while in marquee', () => {
    let state: InteractionMode = IDLE
    state = interactionReducer(state, { type: 'START_MARQUEE', startX: 0, startY: 0 })
    state = interactionReducer(state, { type: 'START_PAN', startX: 0, startY: 0, stagePos: { x: 0, y: 0 } })
    expect(state.type).toBe('marquee')
  })
})

describe('useInteractionMode hook', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useInteractionMode())
    expect(isIdle(result.current.mode)).toBe(true)
  })

  it('supports full pan lifecycle', () => {
    const { result } = renderHook(() => useInteractionMode())

    act(() => result.current.startPan(100, 200, { x: 0, y: 0 }))
    expect(isPanning(result.current.mode)).toBe(true)

    act(() => result.current.panMoved())
    if (isPanning(result.current.mode)) {
      expect(result.current.mode.didPan).toBe(true)
    }

    act(() => result.current.endPan())
    expect(isIdle(result.current.mode)).toBe(true)
  })

  it('supports full draw lifecycle', () => {
    const { result } = renderHook(() => useInteractionMode())

    act(() => result.current.startDraw(50, 50, null, false))
    expect(isDrawing(result.current.mode)).toBe(true)

    act(() => result.current.endDraw())
    expect(isIdle(result.current.mode)).toBe(true)
  })

  it('reset returns to idle from any state', () => {
    const { result } = renderHook(() => useInteractionMode())

    act(() => result.current.startMarquee(10, 20))
    expect(isMarquee(result.current.mode)).toBe(true)

    act(() => result.current.reset())
    expect(isIdle(result.current.mode)).toBe(true)
  })
})
