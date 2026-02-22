/**
 * Tests for the board route error boundary (src/app/board/[id]/error.tsx).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BoardError from './error'

describe('BoardError', () => {
  it('renders heading and action buttons', () => {
    render(<BoardError error={new Error('load failed')} reset={vi.fn()} />)
    expect(screen.getByText('Failed to load board')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my boards/i })).toBeInTheDocument()
  })

  it('calls reset when Try again is clicked', async () => {
    const reset = vi.fn()
    render(<BoardError error={new Error('load failed')} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
