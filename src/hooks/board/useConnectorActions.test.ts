import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConnectorActions, pickBestAnchor } from './useConnectorActions'
import { makeRectangle, makeLine, makeArrow, objectsMap, resetFactory } from '@/test/boardObjectFactory'
import { BoardObject } from '@/types/board'
import { createRef } from 'react'

// Mock anchorPoints — provide controllable anchors
vi.mock('@/components/board/anchorPoints', () => ({
  getShapeAnchors: (obj: BoardObject) => {
    // Return 4 anchors at midpoints of edges
    return [
      { id: 'top', x: obj.x + (obj.width / 2), y: obj.y },
      { id: 'bottom', x: obj.x + (obj.width / 2), y: obj.y + obj.height },
      { id: 'left', x: obj.x, y: obj.y + (obj.height / 2) },
      { id: 'right', x: obj.x + obj.width, y: obj.y + (obj.height / 2) },
    ]
  },
  findNearestAnchor: (anchors: Array<{ id: string; x: number; y: number }>, px: number, py: number, maxDist: number) => {
    let best = null
    let bestDist = maxDist
    for (const a of anchors) {
      const dist = Math.sqrt((a.x - px) ** 2 + (a.y - py) ** 2)
      if (dist < bestDist) {
        bestDist = dist
        best = a
      }
    }
    return best
  },
}))

vi.mock('@/components/board/shapeUtils', () => ({
  isVectorType: (type: string) => type === 'line' || type === 'arrow',
}))

vi.mock('@/components/board/autoRoute', () => ({
  parseWaypoints: (str: string | null | undefined) => {
    if (!str) return []
    try { return JSON.parse(str) } catch { return [] }
  },
  computeAutoRoute: () => [],
}))

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, BoardObject>,
    canEdit: true,
    updateObject: vi.fn(),
    updateObjectDrag: vi.fn(),
    updateObjectDragEnd: vi.fn(),
    addObject: vi.fn(() => null),
    checkFrameContainment: vi.fn(),
    undoStack: { push: vi.fn() },
    markActivity: vi.fn(),
    setSnapIndicator: vi.fn(),
    setShapePalette: vi.fn(),
    shapePalette: null as { lineId: string; canvasX: number; canvasY: number; screenX: number; screenY: number } | null,
    autoRoutePointsRef: { current: new Map<string, number[]>() },
    ...overrides,
  }
}

describe('pickBestAnchor (pure function)', () => {
  it('returns null for empty anchors', () => {
    const connector = makeLine({ connect_start_id: 'a', connect_end_id: 'b' })
    expect(pickBestAnchor(connector, 'start', [])).toBeNull()
  })

  it('returns null for self-loop connectors', () => {
    const connector = makeLine({ connect_start_id: 'a', connect_end_id: 'a' })
    const anchors = [{ id: 'top', x: 100, y: 50 }]
    expect(pickBestAnchor(connector, 'start', anchors)).toBeNull()
  })

  it('picks nearest anchor to the other endpoint', () => {
    const connector = makeLine({ x: 50, y: 50, x2: 200, y2: 50, connect_start_id: 'a', connect_end_id: 'b' })
    const anchors = [
      { id: 'left', x: 10, y: 50 },
      { id: 'right', x: 190, y: 50 },
    ]
    // For start endpoint, reference is the end (200,50), so nearest anchor to (200,50) is 'right'
    const result = pickBestAnchor(connector, 'start', anchors)
    expect(result?.anchorId).toBe('right')
  })

  it('uses provided otherEndpoint coords when given', () => {
    const connector = makeLine({ x: 50, y: 50, x2: 200, y2: 50, connect_start_id: 'a', connect_end_id: 'b' })
    const anchors = [
      { id: 'left', x: 10, y: 50 },
      { id: 'right', x: 190, y: 50 },
    ]
    // Override other endpoint to be near left
    const result = pickBestAnchor(connector, 'start', anchors, { x: 5, y: 50 })
    expect(result?.anchorId).toBe('left')
  })
})

describe('useConnectorActions', () => {
  beforeEach(() => resetFactory())

  describe('connectionIndex', () => {
    it('builds index mapping shapes to their connectors', () => {
      const rect = makeRectangle({ id: 'r1' })
      const line = makeLine({ id: 'l1', connect_start_id: 'r1', connect_end_id: 'r2' })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      expect(result.current.connectionIndex.get('r1')).toEqual([
        { connectorId: 'l1', endpoint: 'start' },
      ])
      expect(result.current.connectionIndex.get('r2')).toEqual([
        { connectorId: 'l1', endpoint: 'end' },
      ])
    })

    it('returns empty map when no connectors', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useConnectorActions(deps))
      expect(result.current.connectionIndex.size).toBe(0)
    })
  })

  describe('computeAllAnchors', () => {
    it('excludes the given id, vector types, and groups', () => {
      const r1 = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const r2 = makeRectangle({ id: 'r2', x: 200, y: 200, width: 100, height: 80 })
      const line = makeLine({ id: 'l1' })
      const group = { ...makeRectangle({ id: 'g1' }), type: 'group' as const }
      const deps = makeDeps({ objects: objectsMap(r1, r2, line, group) })
      const { result } = renderHook(() => useConnectorActions(deps))

      let allAnchors: ReturnType<typeof result.current.computeAllAnchors>
      act(() => { allAnchors = result.current.computeAllAnchors('r1') })

      // Should only include r2 anchors (r1 excluded, line/group filtered)
      expect(allAnchors!.shapeMap.has('r2')).toBe(true)
      expect(allAnchors!.shapeMap.has('r1')).toBe(false)
      expect(allAnchors!.shapeMap.has('l1')).toBe(false)
      expect(allAnchors!.shapeMap.has('g1')).toBe(false)
    })

    it('excludes soft-deleted objects', () => {
      const r1 = makeRectangle({ id: 'r1', deleted_at: '2026-01-01T00:00:00Z' })
      const deps = makeDeps({ objects: objectsMap(r1) })
      const { result } = renderHook(() => useConnectorActions(deps))

      let allAnchors: ReturnType<typeof result.current.computeAllAnchors>
      act(() => { allAnchors = result.current.computeAllAnchors('__none__') })
      expect(allAnchors!.shapeMap.has('r1')).toBe(false)
    })
  })

  describe('handleEndpointDragMove', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      const { result } = renderHook(() => useConnectorActions(deps))
      act(() => result.current.handleEndpointDragMove('l1', { x: 10, y: 20 }))
      expect(deps.updateObjectDrag).not.toHaveBeenCalled()
    })

    it('snaps start endpoint to nearby anchor', () => {
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const line = makeLine({ id: 'l1' })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      // Drag start endpoint near the right midpoint (100, 40) of rect
      act(() => result.current.handleEndpointDragMove('l1', { x: 105, y: 42 }))

      // Should snap to (100, 40)
      expect(deps.updateObjectDrag).toHaveBeenCalledWith('l1', expect.objectContaining({ x: 100, y: 40 }))
      expect(deps.setSnapIndicator).toHaveBeenCalledWith({ x: 100, y: 40 })
    })

    it('clears snap indicator when no snap target nearby', () => {
      const line = makeLine({ id: 'l1' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleEndpointDragMove('l1', { x: 500, y: 500 }))
      expect(deps.setSnapIndicator).toHaveBeenCalledWith(null)
    })
  })

  describe('handleWaypointDragEnd', () => {
    it('updates waypoint at given index with undo', () => {
      const line = makeLine({ id: 'l1', waypoints: '[100,100,200,200]' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleWaypointDragEnd('l1', 0, 150, 150))

      expect(deps.updateObject).toHaveBeenCalledWith('l1', {
        waypoints: JSON.stringify([150, 150, 200, 200]),
      })
      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'update',
        patches: [{ id: 'l1', before: { waypoints: '[100,100,200,200]' } }],
      })
    })

    it('does nothing with out-of-bounds index', () => {
      const line = makeLine({ id: 'l1', waypoints: '[100,100]' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleWaypointDragEnd('l1', 5, 150, 150))
      expect(deps.updateObject).not.toHaveBeenCalled()
    })
  })

  describe('handleWaypointInsert', () => {
    it('inserts midpoint at given segment index', () => {
      const line = makeLine({ id: 'l1', x: 0, y: 0, x2: 200, y2: 0, waypoints: '[100,0]' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      // Insert between segment 0 (start→wp0): midpoint of (0,0)→(100,0) = (50,0)
      act(() => result.current.handleWaypointInsert('l1', 0))

      expect(deps.updateObject).toHaveBeenCalledWith('l1', {
        waypoints: JSON.stringify([50, 0, 100, 0]),
      })
    })
  })

  describe('handleWaypointDelete', () => {
    it('removes waypoint at given index', () => {
      const line = makeLine({ id: 'l1', waypoints: '[100,100,200,200]' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleWaypointDelete('l1', 0))

      expect(deps.updateObject).toHaveBeenCalledWith('l1', {
        waypoints: JSON.stringify([200, 200]),
      })
    })

    it('sets waypoints to null when last waypoint removed', () => {
      const line = makeLine({ id: 'l1', waypoints: '[100,100]' })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleWaypointDelete('l1', 0))

      expect(deps.updateObject).toHaveBeenCalledWith('l1', { waypoints: null })
    })
  })

  describe('handleDrawLineFromAnchor', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      const { result } = renderHook(() => useConnectorActions(deps))
      act(() => result.current.handleDrawLineFromAnchor('line', 'r1', 'top', 50, 0, 200, 100))
      expect(deps.addObject).not.toHaveBeenCalled()
    })

    it('creates a line with start connection and pushes undo', () => {
      const addObject = vi.fn(() => makeLine({ id: 'new-line' }))
      const deps = makeDeps({ addObject })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleDrawLineFromAnchor('line', 'r1', 'top', 50, 0, 500, 500))

      expect(addObject).toHaveBeenCalledWith('line', 50, 0, expect.objectContaining({
        connect_start_id: 'r1',
        connect_start_anchor: 'top',
      }))
      expect(deps.undoStack.push).toHaveBeenCalledWith({ type: 'add', ids: ['new-line'] })
    })

    it('sets marker_end for arrows', () => {
      const addObject = vi.fn(() => makeArrow({ id: 'new-arrow' }))
      const deps = makeDeps({ addObject })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleDrawLineFromAnchor('arrow', 'r1', 'top', 50, 0, 500, 500))

      expect(addObject).toHaveBeenCalledWith('arrow', 50, 0, expect.objectContaining({
        marker_end: 'arrow',
      }))
    })

    it('shows shape palette when end is unconnected', () => {
      const addObject = vi.fn(() => makeLine({ id: 'new-line' }))
      const deps = makeDeps({ addObject })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handleDrawLineFromAnchor('line', 'r1', 'top', 50, 0, 500, 500, 400, 300))

      expect(deps.setShapePalette).toHaveBeenCalledWith(expect.objectContaining({
        lineId: 'new-line',
        screenX: 400,
        screenY: 300,
      }))
    })

    it('snaps end to existing shape anchor and sets connect_end_id/anchor', () => {
      // Place a target rect so its anchors are within SNAP_DISTANCE of the line end
      const targetRect = makeRectangle({ id: 'target', x: 180, y: 80, width: 100, height: 80 })
      const addObject = vi.fn(() => makeLine({ id: 'new-line' }))
      const deps = makeDeps({ objects: objectsMap(targetRect), addObject })
      const { result } = renderHook(() => useConnectorActions(deps))

      // End at (230, 80) which is the 'top' anchor of targetRect (180 + 100/2, 80)
      act(() => result.current.handleDrawLineFromAnchor('line', 'r1', 'top', 50, 0, 230, 80))

      expect(addObject).toHaveBeenCalledWith('line', 50, 0, expect.objectContaining({
        connect_end_id: 'target',
        connect_end_anchor: 'top',
        x2: 230,
        y2: 80,
      }))
      // setShapePalette should NOT be called since end is connected
      expect(deps.setShapePalette).not.toHaveBeenCalled()
    })
  })

  describe('handlePaletteShapeSelect', () => {
    it('does nothing when canEdit is false', () => {
      const deps = makeDeps({
        canEdit: false,
        shapePalette: { lineId: 'l1', canvasX: 200, canvasY: 200, screenX: 100, screenY: 100 },
      })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handlePaletteShapeSelect('rectangle'))

      expect(deps.addObject).not.toHaveBeenCalled()
    })

    it('does nothing when shapePalette is null', () => {
      const deps = makeDeps({ shapePalette: null })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handlePaletteShapeSelect('rectangle'))

      expect(deps.addObject).not.toHaveBeenCalled()
    })

    it('creates a new shape via addObject and pushes undo entry', () => {
      const newShape = makeRectangle({ id: 'new-shape', x: 140, y: 140, width: 120, height: 120 })
      const addObject = vi.fn(() => newShape)
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 200 })
      const deps = makeDeps({
        objects: objectsMap(line),
        addObject,
        shapePalette: { lineId: 'l1', canvasX: 200, canvasY: 200, screenX: 100, screenY: 100 },
      })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handlePaletteShapeSelect('rectangle'))

      // Should create shape centered on canvasX/canvasY: x = 200 - 120/2 = 140, y = 200 - 120/2 = 140
      expect(addObject).toHaveBeenCalledWith('rectangle', 140, 140, { width: 120, height: 120 })
      // Should push an 'add' undo entry for the new shape
      expect(deps.undoStack.push).toHaveBeenCalledWith({ type: 'add', ids: ['new-shape'] })
      // Should clear shapePalette
      expect(deps.setShapePalette).toHaveBeenCalledWith(null)
    })

    it('updates connector endpoint when nearest anchor is found and pushes update undo entry', () => {
      const newShape = makeRectangle({ id: 'new-shape', x: 140, y: 140, width: 120, height: 120 })
      const addObject = vi.fn(() => newShape)
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 200, connect_end_id: null, connect_end_anchor: null })
      const deps = makeDeps({
        objects: objectsMap(line),
        addObject,
        shapePalette: { lineId: 'l1', canvasX: 200, canvasY: 200, screenX: 100, screenY: 100 },
      })
      const { result } = renderHook(() => useConnectorActions(deps))

      act(() => result.current.handlePaletteShapeSelect('rectangle'))

      // The mock getShapeAnchors returns anchors for the new shape:
      // top: (200, 140), bottom: (200, 260), left: (140, 200), right: (260, 200)
      // findNearestAnchor picks nearest to canvasX=200, canvasY=200 → 'left' at (140, 200) or 'top' at (200, 140)
      // Closest to (200, 200) is 'left' at (140, 200) — distance 60, or 'top' at (200, 140) — distance 60
      // Both are equidistant; the mock iterates in order, so 'top' wins (first found with same distance keeps)

      // Should push an 'update' undo entry for the line before modifying it
      expect(deps.undoStack.push).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'update',
          patches: [{ id: 'l1', before: { x2: 200, y2: 200, connect_end_id: null, connect_end_anchor: null } }],
        })
      )
      // Should update the line's endpoint to connect to the new shape
      expect(deps.updateObject).toHaveBeenCalledWith('l1', expect.objectContaining({
        connect_end_id: 'new-shape',
        connect_end_anchor: expect.any(String),
      }))
      // Should also push an 'add' undo entry for the new shape
      expect(deps.undoStack.push).toHaveBeenCalledWith({ type: 'add', ids: ['new-shape'] })
    })
  })

  describe('resolveSnap', () => {
    it('returns null when no anchor is near', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => useConnectorActions(deps))

      let resolved: ReturnType<typeof result.current.resolveSnap>
      act(() => { resolved = result.current.resolveSnap([], new Map(), 100, 100) })
      expect(resolved!.snap).toBeNull()
      expect(resolved!.shapeId).toBeNull()
    })
  })

  describe('handleEndpointDragEnd', () => {
    it('returns early when canEdit is false', () => {
      const deps = makeDeps({ canEdit: false })
      const { result } = renderHook(() => useConnectorActions(deps))
      const preDragRef = { current: new Map<string, { x: number; y: number; parent_id: string | null }>() }

      act(() => result.current.handleEndpointDragEnd('l1', { x: 10, y: 20 }, preDragRef as never))
      expect(deps.updateObjectDragEnd).not.toHaveBeenCalled()
    })

    it('updates object position and calls updateObjectDragEnd', () => {
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 150 })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const preDragRef = {
        current: new Map([
          ['l1', { x: 40, y: 40, x2: 200, y2: 150, parent_id: null, waypoints: null, connect_start_id: null, connect_end_id: null, connect_start_anchor: null, connect_end_anchor: null }],
        ]),
      }

      act(() => result.current.handleEndpointDragEnd('l1', { x: 500, y: 500 }, preDragRef as never))

      // Should call updateObjectDragEnd with the updates (far from any anchor, so no snap)
      expect(deps.updateObjectDragEnd).toHaveBeenCalledWith('l1', expect.objectContaining({ x: 500, y: 500 }))
      // Should clear snap indicator
      expect(deps.setSnapIndicator).toHaveBeenCalledWith(null)
    })

    it('snaps start endpoint to nearby anchor and sets connect_start_id', () => {
      // Place a rect at (0,0) 100x80 — right midpoint anchor at (100, 40)
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 300, y2: 300 })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const preDragRef = {
        current: new Map([
          ['l1', { x: 50, y: 50, x2: 300, y2: 300, parent_id: null, waypoints: null, connect_start_id: null, connect_end_id: null, connect_start_anchor: null, connect_end_anchor: null }],
        ]),
      }

      // Drag start endpoint near (105, 42) — within SNAP_DISTANCE of right anchor (100, 40)
      act(() => result.current.handleEndpointDragEnd('l1', { x: 105, y: 42 }, preDragRef as never))

      expect(deps.updateObjectDragEnd).toHaveBeenCalledWith('l1', expect.objectContaining({
        x: 100,
        y: 40,
        connect_start_id: 'r1',
        connect_start_anchor: 'right',
      }))
    })

    it('snaps end endpoint to nearby anchor and sets connect_end_id', () => {
      const rect = makeRectangle({ id: 'r1', x: 200, y: 200, width: 100, height: 80 })
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 300, y2: 300 })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const preDragRef = {
        current: new Map([
          ['l1', { x: 50, y: 50, x2: 300, y2: 300, parent_id: null, waypoints: null, connect_start_id: null, connect_end_id: null, connect_start_anchor: null, connect_end_anchor: null }],
        ]),
      }

      // Drag end endpoint near bottom anchor of rect (250, 280)
      act(() => result.current.handleEndpointDragEnd('l1', { x2: 252, y2: 278 }, preDragRef as never))

      expect(deps.updateObjectDragEnd).toHaveBeenCalledWith('l1', expect.objectContaining({
        x2: 250,
        y2: 280,
        connect_end_id: 'r1',
        connect_end_anchor: 'bottom',
      }))
    })

    it('pushes undo entry with pre-drag state and resets preDragRef', () => {
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 150 })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const beforeState = { x: 40, y: 40, x2: 200, y2: 150, parent_id: null, waypoints: null, connect_start_id: null, connect_end_id: null, connect_start_anchor: null, connect_end_anchor: null }
      const preDragRef = {
        current: new Map([['l1', beforeState]]),
      }

      act(() => result.current.handleEndpointDragEnd('l1', { x: 500, y: 500 }, preDragRef as never))

      expect(deps.undoStack.push).toHaveBeenCalledWith({
        type: 'move',
        patches: [{ id: 'l1', before: beforeState }],
      })
      // preDragRef should be reset to empty map
      expect(preDragRef.current.size).toBe(0)
    })

    it('populates preDragRef from current object state when empty', () => {
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 150 })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const preDragRef = {
        current: new Map<string, { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null }>(),
      }

      act(() => result.current.handleEndpointDragEnd('l1', { x: 500, y: 500 }, preDragRef as never))

      // Should still push undo (it populated preDragRef from the object, then consumed it)
      expect(deps.undoStack.push).toHaveBeenCalledWith(expect.objectContaining({
        type: 'move',
        patches: expect.arrayContaining([
          expect.objectContaining({ id: 'l1' }),
        ]),
      }))
      // preDragRef should be reset after processing
      expect(preDragRef.current.size).toBe(0)
    })

    it('clears connection IDs for whole-line drag', () => {
      const line = makeLine({ id: 'l1', x: 50, y: 50, x2: 200, y2: 150 })
      const deps = makeDeps({ objects: objectsMap(line) })
      const { result } = renderHook(() => useConnectorActions(deps))

      const preDragRef = {
        current: new Map([
          ['l1', { x: 50, y: 50, x2: 200, y2: 150, parent_id: null, waypoints: null, connect_start_id: 'r1', connect_end_id: 'r2', connect_start_anchor: 'top', connect_end_anchor: 'bottom' }],
        ]),
      }

      // Both start and end are updated = whole drag
      act(() => result.current.handleEndpointDragEnd('l1', { x: 60, y: 60, x2: 210, y2: 160 }, preDragRef as never))

      expect(deps.updateObjectDragEnd).toHaveBeenCalledWith('l1', expect.objectContaining({
        connect_start_id: null,
        connect_start_anchor: null,
        connect_end_id: null,
        connect_end_anchor: null,
      }))
    })
  })

  describe('followConnectors', () => {
    it('returns early when shape has no connected connectors', () => {
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const deps = makeDeps({ objects: objectsMap(rect) })
      const { result } = renderHook(() => useConnectorActions(deps))
      const updateFn = vi.fn()

      // r1 has no connectors in the index
      act(() => {
        const anchors = [
          { id: 'top', x: 50, y: 0 },
          { id: 'bottom', x: 50, y: 80 },
          { id: 'left', x: 0, y: 40 },
          { id: 'right', x: 100, y: 40 },
        ]
        result.current.followConnectors('r1', anchors, updateFn, false)
      })

      expect(updateFn).not.toHaveBeenCalled()
    })

    it('updates connector endpoints when a connected shape moves', () => {
      // rect at (0,0) 100x80, line connected at start to r1
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const line = makeLine({ id: 'l1', x: 100, y: 40, x2: 300, y2: 300, connect_start_id: 'r1', connect_start_anchor: 'right' })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))
      const updateFn = vi.fn()

      // Simulate shape r1 moved to (50, 50) — new anchors reflect new position
      const newAnchors = [
        { id: 'top', x: 100, y: 50 },
        { id: 'bottom', x: 100, y: 130 },
        { id: 'left', x: 50, y: 90 },
        { id: 'right', x: 150, y: 90 },
      ]
      act(() => result.current.followConnectors('r1', newAnchors, updateFn, true))

      // The line's start endpoint should be updated to the best anchor
      expect(updateFn).toHaveBeenCalledWith('l1', expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        waypoints: null,
      }))
    })

    it('handles self-loop connector by using existing anchor IDs', () => {
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      // Self-loop: both ends connect to same shape
      const line = makeLine({
        id: 'l1',
        x: 100, y: 40, x2: 50, y2: 0,
        connect_start_id: 'r1', connect_end_id: 'r1',
        connect_start_anchor: 'right', connect_end_anchor: 'top',
      })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))
      const updateFn = vi.fn()

      // New anchors after the shape moved
      const newAnchors = [
        { id: 'top', x: 100, y: 50 },
        { id: 'bottom', x: 100, y: 130 },
        { id: 'left', x: 50, y: 90 },
        { id: 'right', x: 150, y: 90 },
      ]
      act(() => result.current.followConnectors('r1', newAnchors, updateFn, true))

      // Self-loop uses the existing anchor IDs to look up positions directly
      expect(updateFn).toHaveBeenCalledWith('l1', expect.objectContaining({
        x: 150,  // 'right' anchor
        y: 90,
        x2: 100, // 'top' anchor
        y2: 50,
        waypoints: null,
      }))
    })

    it('commits anchor ID when commitAnchor is true', () => {
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const line = makeLine({
        id: 'l1', x: 0, y: 40, x2: 300, y2: 300,
        connect_end_id: 'r1', connect_end_anchor: 'left',
      })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))
      const updateFn = vi.fn()

      const newAnchors = [
        { id: 'top', x: 50, y: 0 },
        { id: 'bottom', x: 50, y: 80 },
        { id: 'left', x: 0, y: 40 },
        { id: 'right', x: 100, y: 40 },
      ]

      act(() => result.current.followConnectors('r1', newAnchors, updateFn, true))

      // With commitAnchor=true, should include connect_end_anchor in updates
      expect(updateFn).toHaveBeenCalledWith('l1', expect.objectContaining({
        connect_end_anchor: expect.any(String),
      }))
    })

    it('does not commit anchor ID when commitAnchor is false', () => {
      const rect = makeRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })
      const line = makeLine({
        id: 'l1', x: 0, y: 40, x2: 300, y2: 300,
        connect_end_id: 'r1', connect_end_anchor: 'left',
      })
      const deps = makeDeps({ objects: objectsMap(rect, line) })
      const { result } = renderHook(() => useConnectorActions(deps))
      const updateFn = vi.fn()

      const newAnchors = [
        { id: 'top', x: 50, y: 0 },
        { id: 'bottom', x: 50, y: 80 },
        { id: 'left', x: 0, y: 40 },
        { id: 'right', x: 100, y: 40 },
      ]

      act(() => result.current.followConnectors('r1', newAnchors, updateFn, false))

      // With commitAnchor=false, should NOT include connect_end_anchor
      const call = updateFn.mock.calls[0]
      expect(call[1]).not.toHaveProperty('connect_end_anchor')
    })
  })
})
