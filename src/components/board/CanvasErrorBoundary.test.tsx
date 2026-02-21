/**
 * Tests for CanvasErrorBoundary (error fallback UI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'

const ThrowError = () => {
  throw new Error('Test error')
}

describe('CanvasErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <CanvasErrorBoundary>
        <div data-testid="child">Content</div>
      </CanvasErrorBoundary>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <CanvasErrorBoundary>
        <ThrowError />
      </CanvasErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/canvas encountered an error/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument()
  })

  it('Refresh page button triggers reload', async () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    render(
      <CanvasErrorBoundary>
        <ThrowError />
      </CanvasErrorBoundary>
    )
    await userEvent.click(screen.getByRole('button', { name: /refresh page/i }))
    expect(reloadMock).toHaveBeenCalled()
  })
})
