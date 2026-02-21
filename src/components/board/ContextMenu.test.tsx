import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ContextMenu } from './ContextMenu'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeArrow, makeTable } from '@/test/boardObjectFactory'
import type { BoardObject } from '@/types/board'

// ── Helpers ───────────────────────────────────────────────────────────────

function renderMenu(
  objectId: string,
  objects: Map<string, BoardObject>,
  mutationsOverrides = {},
  boardOverrides = {}
) {
  const onClose = vi.fn()
  const Wrapper = createBoardContextWrapper({
    boardValue: { objects, isObjectLocked: () => false, activeGroupId: null, ...boardOverrides },
    mutationsValue: {
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onGroup: vi.fn(),
      onUngroup: vi.fn(),
      canGroup: false,
      canUngroup: false,
      canLock: false,
      canUnlock: false,
      canEditVertices: false,
      ...mutationsOverrides,
    },
  })
  render(
    <Wrapper>
      <ContextMenu position={{ x: 100, y: 100 }} objectId={objectId} onClose={onClose} />
    </Wrapper>
  )
  return { onClose }
}

function hoverOpen(buttonName: RegExp) {
  const btn = screen.getByRole('button', { name: buttonName })
  // hover on the wrapper div that contains the circle button
  const wrapper = btn.closest('[data-submenu-id]') ?? btn.parentElement!
  fireEvent.mouseEnter(wrapper)
  act(() => { vi.runAllTimers() })
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ContextMenu', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // ── Top-level buttons always visible ──────────────────────────────────

  it('renders Copy/Paste and Delete circle buttons for unlocked rectangle', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('shows Lock button when canLock and object is not locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canLock: true })
    expect(screen.getByRole('button', { name: /^lock/i })).toBeInTheDocument()
  })

  it('shows Unlock button when canUnlock and object is locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canUnlock: true }, { isObjectLocked: () => true })
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })

  it('calls onDelete and onClose when Delete is clicked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onDelete = vi.fn()
    const { onClose } = renderMenu('obj-1', objects, { onDelete })
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Copy/Paste sub-menu ───────────────────────────────────────────────

  it('expands Copy/Paste sub-menu on hover and shows Duplicate', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    hoverOpen(/copy/i)
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument()
  })

  it('calls onDuplicate and onClose when Duplicate sub-button is clicked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onDuplicate = vi.fn()
    const { onClose } = renderMenu('obj-1', objects, { onDuplicate })
    hoverOpen(/copy/i)
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Arrange sub-menu ──────────────────────────────────────────────────

  it('shows Arrange button when canGroup or canUngroup', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canGroup: true, canUngroup: true })
    expect(screen.getByRole('button', { name: /arrange/i })).toBeInTheDocument()
  })

  it('expands Arrange sub-menu showing Group and Ungroup on hover', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canGroup: true, canUngroup: true })
    hoverOpen(/arrange/i)
    expect(screen.getByRole('button', { name: /^group/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ungroup/i })).toBeInTheDocument()
  })

  // ── Edit sub-menu (table operations) ──────────────────────────────────

  it('shows Edit button for table type', () => {
    const tableObj = makeTable({ id: 'obj-1' })
    const objects = new Map([['obj-1', tableObj]])
    renderMenu('obj-1', objects)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('expands Edit sub-menu showing table operations on hover', () => {
    const tableObj = makeTable({ id: 'obj-1' })
    const objects = new Map([['obj-1', tableObj]])
    renderMenu('obj-1', objects, {
      onAddRow: vi.fn(),
      onDeleteRow: vi.fn(),
      onAddColumn: vi.fn(),
      onDeleteColumn: vi.fn(),
    })
    hoverOpen(/edit/i)
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete row/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add column/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete column/i })).toBeInTheDocument()
  })

  // ── Markers moved to PropertiesPanel — not in context menu ────────────

  it('does not show marker options (markers live in PropertiesPanel now)', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.queryByText('Start marker')).not.toBeInTheDocument()
    expect(screen.queryByText('End marker')).not.toBeInTheDocument()
  })
})
