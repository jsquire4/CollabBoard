import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCanvasOverlayPosition } from './useCanvasOverlayPosition'
import { mockViewport } from '@/test/viewportHelpers'
import { createRef, RefObject } from 'react'

// Helper to create a ref-like object with a specific offsetWidth/offsetHeight.
// createRef() seals the `current` property as non-configurable, so we use a
// plain object cast to RefObject instead.
function makeRef(w = 240, h = 40): RefObject<HTMLElement | null> {
  return { current: { offsetWidth: w, offsetHeight: h } as unknown as HTMLElement }
}

const defaultStagePos = { x: 0, y: 0 }

describe('useCanvasOverlayPosition', () => {
  beforeEach(() => {
    mockViewport(1200, 800)
  })

  it('returns null when bbox is null', () => {
    const ref = makeRef()
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(null, defaultStagePos, 1, ref)
    )
    expect(result.current).toBeNull()
  })

  it('returns null when stageScale is 0', () => {
    const ref = makeRef()
    const bbox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 0, ref)
    )
    expect(result.current).toBeNull()
  })

  it('returns null when stageScale is negative', () => {
    const ref = makeRef()
    const bbox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, -1, ref)
    )
    expect(result.current).toBeNull()
  })

  it('returns null when stageScale is NaN', () => {
    const ref = makeRef()
    const bbox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, NaN, ref)
    )
    expect(result.current).toBeNull()
  })

  it('returns correct position for normal case (stagePos=0, scale=1)', () => {
    // bbox: minX=100, minY=200, maxX=300, maxY=400 → 200px wide, 200px tall
    // screenLeft = 100, screenRight = 300, screenTop = 200
    // centerX = 200, left = 200 - 120 = 80 (barWidth=240, half=120)
    // top = 200 - 40 - 8 = 152
    // No clamping needed (left=80 > margin=8, left+240=320 < 1200-8=1192)
    // Expected: { top: 152, left: 80 }
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 200, maxX: 300, maxY: 400 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 1, ref)
    )
    expect(result.current).toEqual({ top: 152, left: 80 })
  })

  it('returns correct position with scale=2 and stagePos={x:50, y:30}', () => {
    // bbox: minX=100, minY=100, maxX=200, maxY=200
    // screenLeft = 100*2+50=250, screenRight=200*2+50=450, screenTop=100*2+30=230
    // centerX = (250+450)/2 = 350, left = 350 - 120 = 230 (barWidth=240, half=120)
    // top = 230 - 40 - 8 = 182
    // No clamping needed
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const stagePos = { x: 50, y: 30 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, stagePos, 2, ref)
    )
    expect(result.current).toEqual({ top: 182, left: 230 })
  })

  it('clamps left when bar would overflow right viewport edge', () => {
    // Viewport: 1200x800, barWidth=240, margin=8
    // Want centerX such that left = centerX - 120 > 1200 - 240 - 8 = 952
    // Use stagePos.x=1100, scale=1, bbox minX=100, maxX=200
    // screenLeft = 100+1100=1200, screenRight=200+1100=1300
    // centerX = (1200+1300)/2 = 1250, left = 1250 - 120 = 1130
    // Clamped to: 1200 - 240 - 8 = 952
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const stagePos = { x: 1100, y: 0 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, stagePos, 1, ref)
    )
    expect(result.current?.left).toBe(952)
  })

  it('clamps left when bar would overflow left viewport edge', () => {
    // Selection centered at x=50 → left = 50 - 120 = -70
    // Clamped to margin=8
    // stagePos.x=-50, scale=1, bbox minX=100, maxX=100 → both screen coords = 50
    // screenLeft = 100 + (-50) = 50, screenRight = 100 + (-50) = 50
    // centerX = 50, left = 50 - 120 = -70 → clamped to 8
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 200, maxX: 100, maxY: 400 }
    const stagePos = { x: -50, y: 0 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, stagePos, 1, ref)
    )
    expect(result.current?.left).toBe(8)
  })

  it('clamps top when bar would overflow top viewport edge', () => {
    // Selection near top: screenTop = 20
    // top = 20 - 40 - 8 = -28 → clamped to margin=8
    // stagePos.y=0, scale=1, bbox minY=20
    const ref = makeRef(240, 40)
    const bbox = { minX: 400, minY: 20, maxX: 600, maxY: 100 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 1, ref)
    )
    expect(result.current?.top).toBe(8)
  })

  it('clamps top when bar would overflow bottom viewport edge', () => {
    // Viewport height=800, barHeight=40, gap=8, margin=8
    // Max allowed top = 800 - 40 - 8 = 752
    // Place selection so screenTop - 40 - 8 > 752, i.e. screenTop > 800
    // stagePos.y=0, scale=1, bbox minY=900 → screenTop=900
    // top = 900 - 40 - 8 = 852 → clamped to 752
    const ref = makeRef(240, 40)
    const bbox = { minX: 400, minY: 900, maxX: 600, maxY: 1000 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 1, ref)
    )
    expect(result.current?.top).toBe(752)
  })

  it('falls back to default element size (240x40) when elementRef.current is null', () => {
    // Use a ref where current is null (default createRef, not yet attached)
    const ref = createRef<HTMLElement>() // current stays null
    // bbox: minX=100, minY=200, maxX=300, maxY=400
    // Falls back to elWidth=240, elHeight=40
    // left = 200 - 120 = 80, top = 200 - 40 - 8 = 152
    const bbox = { minX: 100, minY: 200, maxX: 300, maxY: 400 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 1, ref)
    )
    expect(result.current).toEqual({ top: 152, left: 80 })
  })

  it('handles extreme zoom (stageScale=100)', () => {
    // bbox: minX=0, minY=0, maxX=1, maxY=1
    // screenLeft = 0*100+0=0, screenRight=1*100+0=100, screenTop=0*100+0=0
    // centerX = 50, left = 50 - 120 = -70 → clamped to 8
    // top = 0 - 40 - 8 = -48 → clamped to 8
    const ref = makeRef(240, 40)
    const bbox = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 100, ref)
    )
    expect(result.current).not.toBeNull()
    expect(result.current?.left).toBe(8)
    expect(result.current?.top).toBe(8)
  })

  it('respects custom gap option', () => {
    // bbox: minX=100, minY=200, maxX=300, maxY=400, scale=1, stagePos=0
    // screenTop = 200, gap=20
    // top = 200 - 40 - 20 = 140 (no clamping)
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 200, maxX: 300, maxY: 400 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, defaultStagePos, 1, ref, { gap: 20 })
    )
    expect(result.current?.top).toBe(140)
  })

  it('respects custom margin option', () => {
    // Selection centered at x=50 → left = 50 - 120 = -70
    // With margin=20, clamped to 20 instead of 8
    const ref = makeRef(240, 40)
    const bbox = { minX: 100, minY: 200, maxX: 100, maxY: 400 }
    const stagePos = { x: -50, y: 0 }
    const { result } = renderHook(() =>
      useCanvasOverlayPosition(bbox, stagePos, 1, ref, { margin: 20 })
    )
    expect(result.current?.left).toBe(20)
  })

  it('updates position when bbox changes', () => {
    // Start with one bbox, then update to another and verify new position is returned
    const ref = makeRef(240, 40)
    let bbox = { minX: 100, minY: 200, maxX: 300, maxY: 400 }
    const { result, rerender } = renderHook(
      ({ b }: { b: typeof bbox }) => useCanvasOverlayPosition(b, defaultStagePos, 1, ref),
      { initialProps: { b: bbox } }
    )
    expect(result.current).toEqual({ top: 152, left: 80 })

    // Move selection to center of viewport: minX=500, maxX=700, minY=400
    // screenLeft=500, screenRight=700, centerX=600, left=600-120=480
    // screenTop=400, top=400-40-8=352
    act(() => {
      bbox = { minX: 500, minY: 400, maxX: 700, maxY: 600 }
    })
    rerender({ b: bbox })
    expect(result.current).toEqual({ top: 352, left: 480 })
  })
})
