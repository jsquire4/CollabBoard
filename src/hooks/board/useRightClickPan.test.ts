import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRightClickPan, UseRightClickPanDeps } from './useRightClickPan'
import { vi } from 'vitest'

function makeDeps(overrides?: Partial<UseRightClickPanDeps>): UseRightClickPanDeps {
  return {
    stageRef: { current: null },
    containerRef: { current: null },
    setStagePos: vi.fn(),
    stageScale: 1,
    gridSize: 40,
    gridSubdivisions: 1,
    gridStyle: 'lines',
    ...overrides,
  }
}

describe('useRightClickPan', () => {
  it('returns isPanning false initially', () => {
    const { result } = renderHook(() => useRightClickPan(makeDeps()))
    expect(result.current.isPanning).toBe(false)
  })

  it('returns didPanRef with initial value false', () => {
    const { result } = renderHook(() => useRightClickPan(makeDeps()))
    expect(result.current.didPanRef.current).toBe(false)
  })

  it('returns stable didPanRef across rerenders', () => {
    const { result, rerender } = renderHook(() => useRightClickPan(makeDeps()))
    const first = result.current.didPanRef
    rerender()
    expect(result.current.didPanRef).toBe(first)
  })

  it('does not throw when stageRef is null', () => {
    // Effect should handle null stageRef gracefully
    expect(() => {
      renderHook(() => useRightClickPan(makeDeps()))
    }).not.toThrow()
  })
})
