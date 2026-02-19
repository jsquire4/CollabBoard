import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRemoteCursors, UseRemoteCursorsDeps } from './useRemoteCursors'

function makeDeps(overrides?: Partial<UseRemoteCursorsDeps>): UseRemoteCursorsDeps {
  return {
    ...overrides,
  }
}

describe('useRemoteCursors', () => {
  it('returns cursorLayerRef initially null', () => {
    const { result } = renderHook(() => useRemoteCursors(makeDeps()))
    expect(result.current.cursorLayerRef.current).toBeNull()
  })

  it('registers callback with onCursorUpdate', () => {
    const onCursorUpdate = vi.fn()
    renderHook(() => useRemoteCursors(makeDeps({ onCursorUpdate })))
    expect(onCursorUpdate).toHaveBeenCalledOnce()
    expect(typeof onCursorUpdate.mock.calls[0][0]).toBe('function')
  })

  it('does not call onCursorUpdate when not provided', () => {
    // Should not throw
    const { result } = renderHook(() => useRemoteCursors(makeDeps()))
    expect(result.current.cursorLayerRef).toBeDefined()
  })

  it('re-registers callback when onCursorUpdate changes', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const { rerender } = renderHook(
      (props: UseRemoteCursorsDeps) => useRemoteCursors(props),
      { initialProps: makeDeps({ onCursorUpdate: cb1 }) },
    )
    expect(cb1).toHaveBeenCalledOnce()

    rerender(makeDeps({ onCursorUpdate: cb2 }))
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('returns stable cursorLayerRef across rerenders', () => {
    const { result, rerender } = renderHook(() => useRemoteCursors(makeDeps()))
    const first = result.current.cursorLayerRef
    rerender()
    expect(result.current.cursorLayerRef).toBe(first)
  })
})
