import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ContextMenu } from './ContextMenu'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeArrow, makeTable, makeLine, makeDataConnector } from '@/test/boardObjectFactory'
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

  it('clears hover timer on unmount to prevent setState after unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(), onDuplicate: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(),
        onPaste: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
        canGroup: false, canUngroup: false, canLock: false, canUnlock: false, canEditVertices: false,
      },
    })
    const { unmount } = render(
      <Wrapper>
        <ContextMenu position={{ x: 100, y: 100 }} objectId="obj-1" onClose={vi.fn()} />
      </Wrapper>
    )
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    const wrapper = copyBtn.closest('[data-submenu-id]') ?? copyBtn.parentElement!
    fireEvent.mouseEnter(wrapper)
    clearTimeoutSpy.mockClear()
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
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

  // ── Order sub-menu (z-order) ──────────────────────────────────────────

  it('shows Order button for unlocked objects', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.getByRole('button', { name: /order/i })).toBeInTheDocument()
  })

  it('hides Order button when object is locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, {}, { isObjectLocked: () => true })
    expect(screen.queryByRole('button', { name: /^order$/i })).not.toBeInTheDocument()
  })

  it('expands Order sub-menu showing all four z-order actions on hover', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    hoverOpen(/^order$/i)
    expect(screen.getByRole('button', { name: /bring to front/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Forward/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Backward/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send to back/i })).toBeInTheDocument()
  })

  it('calls onBringToFront and onClose when Bring to Front is clicked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onBringToFront = vi.fn()
    const { onClose } = renderMenu('obj-1', objects, { onBringToFront })
    hoverOpen(/^order$/i)
    fireEvent.click(screen.getByRole('button', { name: /bring to front/i }))
    expect(onBringToFront).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Comment button ─────────────────────────────────────────────────────

  it('shows Comment button for rectangle objects', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.getByRole('button', { name: /comment/i })).toBeInTheDocument()
  })

  it('hides Comment button for line objects', () => {
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument()
  })

  it('hides Comment button for data_connector objects', () => {
    const objects = new Map([['obj-1', makeDataConnector({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument()
  })

  it('calls onCommentOpen and onClose when Comment is clicked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onCommentOpen = vi.fn()
    const { onClose } = renderMenu('obj-1', objects, { onCommentOpen })
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(onCommentOpen).toHaveBeenCalledWith('obj-1', expect.any(Number), expect.any(Number))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Edit sub-menu: canEditVertices ─────────────────────────────────────

  it('shows Edit button when canEditVertices is true', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canEditVertices: true })
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('expands Edit sub-menu showing Edit Vertices button when canEditVertices', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    const onEditVertices = vi.fn()
    renderMenu('obj-1', objects, { canEditVertices: true, onEditVertices })
    hoverOpen(/edit/i)
    expect(screen.getByRole('button', { name: /edit vertices/i })).toBeInTheDocument()
  })

  // ── Delete hidden when locked ──────────────────────────────────────────

  it('hides Delete button when object is locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    renderMenu('obj-1', objects, { canUnlock: true }, { isObjectLocked: () => true })
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  // ── Markers moved to PropertiesPanel — not in context menu ────────────

  it('does not show marker options (markers live in SelectionBar)', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    renderMenu('obj-1', objects)
    expect(screen.queryByText('Start marker')).not.toBeInTheDocument()
    expect(screen.queryByText('End marker')).not.toBeInTheDocument()
  })

  // ── Coordinate passthrough regression (rAF-clamp fix) ─────────────────
  // These tests guard against the Y-offset bug where getBoundingClientRect()
  // returned height=0 before paint, causing the clamp to zero-out position.y.

  it('passes position.x through to the menu element style', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(), onDuplicate: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(),
        onPaste: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
        canGroup: false, canUngroup: false, canLock: false, canUnlock: false, canEditVertices: false,
      },
    })
    render(
      <Wrapper>
        <ContextMenu position={{ x: 250, y: 100 }} objectId="obj-1" onClose={onClose} />
      </Wrapper>
    )
    // Flush the rAF so the clamp effect runs with the real (mocked) getBoundingClientRect
    act(() => { vi.runAllTimers() })
    const menu = screen.getByRole('menu')!
    expect(menu).toHaveStyle({ left: '250px' })
  })

  it('passes position.y through to the menu element style', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(), onDuplicate: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(),
        onPaste: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
        canGroup: false, canUngroup: false, canLock: false, canUnlock: false, canEditVertices: false,
      },
    })
    render(
      <Wrapper>
        <ContextMenu position={{ x: 100, y: 350 }} objectId="obj-1" onClose={onClose} />
      </Wrapper>
    )
    act(() => { vi.runAllTimers() })
    const menu = screen.getByRole('menu')!
    expect(menu).toHaveStyle({ top: '350px' })
  })

  it('renders menu container with both x and y coordinates in style', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(), onDuplicate: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(),
        onPaste: vi.fn(), onGroup: vi.fn(), onUngroup: vi.fn(),
        canGroup: false, canUngroup: false, canLock: false, canUnlock: false, canEditVertices: false,
      },
    })
    render(
      <Wrapper>
        <ContextMenu position={{ x: 400, y: 200 }} objectId="obj-1" onClose={onClose} />
      </Wrapper>
    )
    act(() => { vi.runAllTimers() })
    const menu = screen.getByRole('menu')!
    expect(menu).toHaveStyle({ left: '400px', top: '200px' })
  })
})
