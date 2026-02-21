/**
 * Tests for GridThemeFlyout (grid theme/color picker).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GridThemeFlyout } from './GridThemeFlyout'

describe('GridThemeFlyout', () => {
  const defaultProps = {
    canvasColor: '#FAF8F4',
    gridColor: '#E8E3DA',
    subdivisionColor: '#E8E3DA',
    onUpdate: vi.fn(),
  }

  it('renders theme button', () => {
    render(<GridThemeFlyout {...defaultProps} />)
    expect(screen.getByText(/custom theme/i)).toBeInTheDocument()
  })

  it('opens panel when button clicked', async () => {
    render(<GridThemeFlyout {...defaultProps} />)
    const themeBtn = screen.getByRole('button')
    await userEvent.click(themeBtn)
    expect(screen.getByText('Grid Theme')).toBeInTheDocument()
    expect(screen.getByText('Presets')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('calls onUpdate when preset clicked', async () => {
    const onUpdate = vi.fn()
    render(<GridThemeFlyout {...defaultProps} onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button'))
    const presetBtn = screen.getByRole('button', { name: /default/i })
    await userEvent.click(presetBtn)
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas_color: expect.any(String),
        grid_color: expect.any(String),
        subdivision_color: expect.any(String),
      })
    )
  })

  it('closes on Escape', async () => {
    render(<GridThemeFlyout {...defaultProps} />)
    await userEvent.click(screen.getByRole('button'))
    const panel = screen.getByText('Grid Theme').closest('div[class*="fixed"]')
    expect(panel).toBeInTheDocument()
    fireEvent.keyDown(panel!, { key: 'Escape' })
    expect(screen.queryByText('Grid Theme')).not.toBeInTheDocument()
  })

  it('supports dark mode styling', () => {
    render(<GridThemeFlyout {...defaultProps} dark={true} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/parchment|dark/)
  })
})
