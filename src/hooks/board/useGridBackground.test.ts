import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { computeGridStyles, useGridBackground, UseGridBackgroundDeps } from './useGridBackground'

function makeDeps(overrides?: Partial<UseGridBackgroundDeps>): UseGridBackgroundDeps {
  return {
    stagePos: { x: 0, y: 0 },
    stageScale: 1,
    gridSize: 40,
    gridSubdivisions: 1,
    gridStyle: 'lines',
    gridVisible: true,
    canvasColor: '#e8ecf1',
    gridColor: '#b4becd',
    subdivisionColor: '#b4becd',
    snapToGridEnabled: false,
    ...overrides,
  }
}

describe('computeGridStyles', () => {
  it('returns empty object when gridVisible is false', () => {
    const result = computeGridStyles(makeDeps({ gridVisible: false }))
    expect(result).toEqual({})
  })

  it('returns empty object when fully zoomed out (scale <= 0.2)', () => {
    const result = computeGridStyles(makeDeps({ stageScale: 0.1 }))
    expect(result).toEqual({})
  })

  it('returns backgroundImage for lines style', () => {
    const result = computeGridStyles(makeDeps({ gridStyle: 'lines' }))
    expect(result.backgroundImage).toBeDefined()
    expect(result.backgroundImage).toContain('linear-gradient')
    expect(result.backgroundImage).not.toContain('radial-gradient')
  })

  it('returns backgroundImage for dots style', () => {
    const result = computeGridStyles(makeDeps({ gridStyle: 'dots' }))
    expect(result.backgroundImage).toBeDefined()
    expect(result.backgroundImage).toContain('radial-gradient')
    expect(result.backgroundImage).not.toContain('linear-gradient')
  })

  it('returns both patterns for both style', () => {
    const result = computeGridStyles(makeDeps({ gridStyle: 'both' }))
    expect(result.backgroundImage).toBeDefined()
    expect(result.backgroundImage).toContain('linear-gradient')
    expect(result.backgroundImage).toContain('radial-gradient')
  })

  it('includes subdivision patterns when subdivisions > 1', () => {
    const withSub = computeGridStyles(makeDeps({ gridSubdivisions: 4, gridStyle: 'lines' }))
    const withoutSub = computeGridStyles(makeDeps({ gridSubdivisions: 1, gridStyle: 'lines' }))
    // More gradient layers with subdivisions
    const withSubCount = (withSub.backgroundImage ?? '').split('linear-gradient').length - 1
    const withoutSubCount = (withoutSub.backgroundImage ?? '').split('linear-gradient').length - 1
    expect(withSubCount).toBeGreaterThan(withoutSubCount)
  })

  it('uses higher alpha when snapToGrid is enabled', () => {
    const withSnap = computeGridStyles(makeDeps({ snapToGridEnabled: true }))
    const withoutSnap = computeGridStyles(makeDeps({ snapToGridEnabled: false }))
    // Both should have backgroundImage but snap version should have different alpha
    expect(withSnap.backgroundImage).toBeDefined()
    expect(withoutSnap.backgroundImage).toBeDefined()
    expect(withSnap.backgroundImage).not.toEqual(withoutSnap.backgroundImage)
  })

  it('positions grid based on stagePos', () => {
    const result = computeGridStyles(makeDeps({ stagePos: { x: 100, y: 200 } }))
    expect(result.backgroundPosition).toContain('100px')
    expect(result.backgroundPosition).toContain('200px')
  })

  it('scales grid size based on stageScale', () => {
    const at1x = computeGridStyles(makeDeps({ stageScale: 1, gridSize: 40 }))
    const at2x = computeGridStyles(makeDeps({ stageScale: 2, gridSize: 40 }))
    // 40px at 1x vs 80px at 2x
    expect(at1x.backgroundSize).toContain('40px')
    expect(at2x.backgroundSize).toContain('80px')
  })
})

describe('useGridBackground', () => {
  it('returns containerRef, dimensions, and gridStyles', () => {
    const { result } = renderHook(() => useGridBackground(makeDeps()))
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.dimensions).toEqual({ width: 800, height: 600 })
    expect(result.current.gridStyles).toBeDefined()
  })

  it('returns empty gridStyles when grid not visible', () => {
    const { result } = renderHook(() => useGridBackground(makeDeps({ gridVisible: false })))
    expect(result.current.gridStyles).toEqual({})
  })

  it('returns stable containerRef across rerenders', () => {
    const { result, rerender } = renderHook(() => useGridBackground(makeDeps()))
    const first = result.current.containerRef
    rerender()
    expect(result.current.containerRef).toBe(first)
  })
})
