/**
 * Tests for useFlyoutPosition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen } from '@testing-library/react'
import { useFlyoutPosition } from './useFlyoutPosition'

function TestFlyout({ isOpen }: { isOpen: boolean }) {
  const { btnRef, panelRef, panelPos } = useFlyoutPosition(isOpen)
  return (
    <div>
      <button ref={btnRef} type="button">Trigger</button>
      {isOpen && (
        <div ref={panelRef} style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, height: 100 }}>
          Panel
        </div>
      )}
    </div>
  )
}

describe('useFlyoutPosition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns refs and initial panelPos when closed', () => {
    const { result } = renderHook(() => useFlyoutPosition(false))
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.btnRef).toBeDefined()
    expect(result.current.panelRef).toBeDefined()
    expect(result.current.panelPos).toEqual({ top: 0, left: 0 })
  })

  it('computes position when isOpen true with rendered button', async () => {
    const { rerender } = render(<TestFlyout isOpen={false} />)
    expect(screen.getByRole('button', { name: /trigger/i })).toBeInTheDocument()

    rerender(<TestFlyout isOpen={true} />)
    await act(async () => {
      vi.runAllTimers()
    })
    expect(screen.getByText('Panel')).toBeInTheDocument()
  })
})
