/**
 * Tests for ConnectionBanner (connection status).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectionBanner } from './ConnectionBanner'

describe('ConnectionBanner', () => {
  it('returns null when connected', () => {
    const { container } = render(<ConnectionBanner status="connected" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows disconnected message', () => {
    render(<ConnectionBanner status="disconnected" />)
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument()
    expect(screen.getByText(/attempting to reconnect/i)).toBeInTheDocument()
  })

  it('shows reconnecting message', () => {
    render(<ConnectionBanner status="reconnecting" />)
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
  })

  it('shows auth_expired message', () => {
    render(<ConnectionBanner status="auth_expired" />)
    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
    expect(screen.getByText(/refresh the page/i)).toBeInTheDocument()
  })
})
