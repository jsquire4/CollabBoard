/**
 * Tests for GridSettingsPopover component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GridSettingsPopover } from './GridSettingsPopover'

describe('GridSettingsPopover', () => {
  const defaultProps = {
    gridSize: 20,
    gridSubdivisions: 2,
    gridVisible: true,
    snapToGrid: true,
    gridStyle: 'lines' as const,
    canvasColor: '#FAF8F4',
    gridColor: '#E8E3DA',
    subdivisionColor: '#E8E3DA',
    onUpdate: vi.fn(),
  }

  it('renders Grid Options button', () => {
    render(<GridSettingsPopover {...defaultProps} />)
    expect(screen.getByRole('button', { name: /grid options/i })).toBeInTheDocument()
  })

  it('opens panel when button clicked', async () => {
    render(<GridSettingsPopover {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    expect(screen.getByText('Grid Settings')).toBeInTheDocument()
    expect(screen.getByText('Grid On')).toBeInTheDocument()
    expect(screen.getByText('Snap On')).toBeInTheDocument()
  })

  it('closes panel on Escape', async () => {
    render(<GridSettingsPopover {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    expect(screen.getByText('Grid Settings')).toBeInTheDocument()

    const panel = screen.getByText('Grid Settings').closest('div[class*="fixed"]')
    fireEvent.keyDown(panel!, { key: 'Escape' })

    expect(screen.queryByText('Grid Settings')).not.toBeInTheDocument()
  })

  it('calls onUpdate when Grid On/Off clicked', async () => {
    const onUpdate = vi.fn()
    render(<GridSettingsPopover {...defaultProps} gridVisible={true} onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    await userEvent.click(screen.getByText('Grid On'))
    expect(onUpdate).toHaveBeenCalledWith({ grid_visible: false })
  })

  it('calls onUpdate when Snap On/Off clicked', async () => {
    const onUpdate = vi.fn()
    render(<GridSettingsPopover {...defaultProps} snapToGrid={true} onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    await userEvent.click(screen.getByText('Snap On'))
    expect(onUpdate).toHaveBeenCalledWith({ snap_to_grid: false })
  })

  it('calls onUpdate when Interval select changed', async () => {
    const onUpdate = vi.fn()
    render(<GridSettingsPopover {...defaultProps} onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    const selects = screen.getAllByRole('combobox')
    const intervalSelect = selects[0] // first select is Interval (10px, 20px, etc.)
    await userEvent.selectOptions(intervalSelect, '40')
    expect(onUpdate).toHaveBeenCalledWith({ grid_size: 40 })
  })

  it('calls onUpdate when Subdivisions select changed', async () => {
    const onUpdate = vi.fn()
    render(<GridSettingsPopover {...defaultProps} onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    const selects = screen.getAllByRole('combobox')
    const subdivisionsSelect = selects.find(s => s.querySelector('option[value="4"]')) ?? selects[1]
    await userEvent.selectOptions(subdivisionsSelect, '4')
    expect(onUpdate).toHaveBeenCalledWith({ grid_subdivisions: 4 })
  })

  it('shows Grid Off when gridVisible is false', async () => {
    render(<GridSettingsPopover {...defaultProps} gridVisible={false} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    expect(screen.getByText('Grid Off')).toBeInTheDocument()
  })

  it('renders GridThemeFlyout inside panel', async () => {
    render(<GridSettingsPopover {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /grid options/i }))
    expect(screen.getByText(/custom theme/i)).toBeInTheDocument()
  })
})
