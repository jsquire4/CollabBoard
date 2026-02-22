/**
 * Tests for the boards route error boundary (src/app/boards/error.tsx).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BoardsError from './error'

describe('BoardsError', () => {
  it('renders heading and action buttons', () => {
    render(<BoardsError error={new Error('db error')} reset={vi.fn()} />)
    expect(screen.getByText('Failed to load boards')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument()
  })

  it('calls reset when Try again is clicked', async () => {
    const reset = vi.fn()
    render(<BoardsError error={new Error('db error')} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
