/**
 * Tests for ConnectionBanner (connection status).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ConnectionBanner } from './ConnectionBanner'

describe('ConnectionBanner', () => {
  it('returns null when connected', () => {
    const { container } = render(<ConnectionBanner status="connected" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows disconnected message immediately', () => {
    render(<ConnectionBanner status="disconnected" />)
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument()
    expect(screen.getByText(/attempting to reconnect/i)).toBeInTheDocument()
  })

  it('shows reconnecting message after delay', () => {
    vi.useFakeTimers()
    const { container } = render(<ConnectionBanner status="reconnecting" showDelay={2000} />)
    // Not visible immediately
    expect(container.firstChild).toBeNull()
    // Visible after delay
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides reconnecting banner if connection restores before delay', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<ConnectionBanner status="reconnecting" showDelay={2000} />)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(container.firstChild).toBeNull()
    // Connection restores
    rerender(<ConnectionBanner status="connected" showDelay={2000} />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(container.firstChild).toBeNull()
    vi.useRealTimers()
  })

  it('shows auth_expired message immediately', () => {
    render(<ConnectionBanner status="auth_expired" />)
    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
    expect(screen.getByText(/refresh the page/i)).toBeInTheDocument()
  })
})
