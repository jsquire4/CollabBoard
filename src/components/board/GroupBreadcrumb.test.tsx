/**
 * Tests for GroupBreadcrumb (group navigation).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupBreadcrumb } from './GroupBreadcrumb'

describe('GroupBreadcrumb', () => {
  it('returns null when activeGroupId is null', () => {
    const { container } = render(<GroupBreadcrumb activeGroupId={null} onExit={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when activeGroupId is set', () => {
    render(<GroupBreadcrumb activeGroupId="g1" onExit={vi.fn()} />)
    expect(screen.getByText('Inside group')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /exit/i })).toBeInTheDocument()
  })

  it('calls onExit when Exit clicked', async () => {
    const onExit = vi.fn()
    render(<GroupBreadcrumb activeGroupId="g1" onExit={onExit} />)
    await userEvent.click(screen.getByRole('button', { name: /exit/i }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('Exit button has title for Esc hint', () => {
    render(<GroupBreadcrumb activeGroupId="g1" onExit={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /exit/i })
    expect(btn).toHaveAttribute('title', 'Exit group (Esc)')
  })
})
