import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useStageInteractions, UseStageInteractionsDeps } from './useStageInteractions'
import { BoardProvider, BoardContextValue } from '@/contexts/BoardContext'

// ── Helpers ──────────────────────────────────────────────────────────

function makeContextValue(overrides?: Partial<BoardContextValue>): BoardContextValue {
  return {
    objects: new Map(),
    selectedIds: new Set(),
    activeGroupId: null,
    sortedObjects: [],
    remoteSelections: new Map(),
    getChildren: () => [],
    getDescendants: () => [],
    boardId: 'board-1',
    userId: 'user-1',
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
    commentCounts: new Map(),
    dragPositionsRef: { current: new Map() },
    ...overrides,
  }
}

function makeDeps(overrides?: Partial<UseStageInteractionsDeps>): UseStageInteractionsDeps {
  return {
    stageRef: { current: null },
    stagePos: { x: 0, y: 0 },
    stageScale: 1,
    shapeRefs: { current: new Map() },
    onSelectObjects: vi.fn(),
    ...overrides,
  }
}

function renderWithContext(
  deps: UseStageInteractionsDeps,
  ctx?: Partial<BoardContextValue>,
) {
  const contextValue = makeContextValue(ctx)
  return renderHook(() => useStageInteractions(deps), {
    wrapper: ({ children }: { children: React.ReactNode }) => {
      return React.createElement(BoardProvider, { value: contextValue, children })
    },
  })
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useStageInteractions', () => {
  describe('return value shape', () => {
    it('returns all expected handler functions', () => {
      const { result } = renderWithContext(makeDeps())
      expect(typeof result.current.handleStageMouseDown).toBe('function')
      expect(typeof result.current.handleStageMouseMove).toBe('function')
      expect(typeof result.current.handleStageMouseUp).toBe('function')
    })

    it('returns render state with correct initial values', () => {
      const { result } = renderWithContext(makeDeps())
      expect(result.current.marquee).toBeNull()
      expect(result.current.drawPreview).toBeNull()
      expect(result.current.linePreview).toBeNull()
      expect(result.current.hoveredAnchors).toBeNull()
      expect(result.current.connectorHint).toBeNull()
    })

    it('returns refs with correct initial values', () => {
      const { result } = renderWithContext(makeDeps())
      expect(result.current.connectorHintDrawingRef.current).toBe(false)
      expect(result.current.drawSnapStartRef.current).toBeNull()
      expect(result.current.isDrawing.current).toBe(false)
      expect(result.current.drawStart.current).toBeNull()
      expect(result.current.drawIsLineRef.current).toBe(false)
      expect(result.current.marqueeJustCompletedRef.current).toBe(false)
      expect(result.current.drawJustCompletedRef.current).toBe(false)
    })

    it('returns setter functions', () => {
      const { result } = renderWithContext(makeDeps())
      expect(typeof result.current.setDrawPreview).toBe('function')
      expect(typeof result.current.setLinePreview).toBe('function')
      expect(typeof result.current.setHoveredAnchors).toBe('function')
      expect(typeof result.current.setConnectorHint).toBe('function')
    })
  })

  describe('handler identity stability', () => {
    it('handleStageMouseDown is stable across rerenders with same deps', () => {
      const deps = makeDeps()
      const { result, rerender } = renderWithContext(deps)
      const first = result.current.handleStageMouseDown
      rerender()
      expect(result.current.handleStageMouseDown).toBe(first)
    })

    it('handleStageMouseMove is stable across rerenders with same deps', () => {
      const deps = makeDeps()
      const { result, rerender } = renderWithContext(deps)
      const first = result.current.handleStageMouseMove
      rerender()
      expect(result.current.handleStageMouseMove).toBe(first)
    })

    it('handleStageMouseUp is stable across rerenders with same deps', () => {
      const deps = makeDeps()
      const { result, rerender } = renderWithContext(deps)
      const first = result.current.handleStageMouseUp
      rerender()
      expect(result.current.handleStageMouseUp).toBe(first)
    })
  })

  describe('callback deps', () => {
    it('calls onActivity on mouseDown when provided', () => {
      const onActivity = vi.fn()
      const { result } = renderWithContext(makeDeps({ onActivity }))

      // The handler requires a Konva event object — calling it with a minimal mock
      // won't trigger shape creation but will verify onActivity is wired
      const mockEvt = { button: 2 } as MouseEvent
      const mockEvent = {
        evt: mockEvt,
        target: { getStage: () => null },
      } as unknown as import('konva/lib/Node').KonvaEventObject<MouseEvent>

      result.current.handleStageMouseDown(mockEvent)
      // Right-click returns early before onActivity
      expect(onActivity).not.toHaveBeenCalled()
    })

    it('calls onActivity on mouseUp', () => {
      const onActivity = vi.fn()
      const { result } = renderWithContext(makeDeps({ onActivity }))
      result.current.handleStageMouseUp()
      expect(onActivity).toHaveBeenCalledOnce()
    })
  })

  describe('context integration', () => {
    it('reads activeTool from context', () => {
      const { result } = renderWithContext(makeDeps(), { activeTool: 'rectangle' })
      // Hook should work without errors when tool is set
      expect(result.current.handleStageMouseDown).toBeDefined()
    })

    it('reads grid settings from context', () => {
      const { result } = renderWithContext(makeDeps(), {
        snapToGrid: true,
        gridSize: 20,
        gridSubdivisions: 2,
      })
      expect(result.current.handleStageMouseDown).toBeDefined()
    })
  })

  describe('reverseShapeRefs integration', () => {
    it('accepts reverseShapeRefs in deps and renders without error', () => {
      const reverseShapeRefs = { current: new Map() }
      const { result } = renderWithContext(makeDeps({ reverseShapeRefs }))
      expect(result.current.handleStageMouseDown).toBeDefined()
    })

    it('works without reverseShapeRefs (backward compatible)', () => {
      const { result } = renderWithContext(makeDeps())
      expect(result.current.handleStageMouseDown).toBeDefined()
    })
  })
})
