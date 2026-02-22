/**
 * Tests for the app-level error boundary (src/app/error.tsx).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppError from './error'

describe('AppError', () => {
  it('renders error heading and description', () => {
    render(<AppError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument()
  })

  it('shows error digest when present', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<AppError error={err} reset={vi.fn()} />)
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
  })

  it('does not show digest section when digest is absent', () => {
    render(<AppError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.queryByText(/Error ID/)).not.toBeInTheDocument()
  })

  it('calls reset when Try again is clicked', async () => {
    const reset = vi.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
