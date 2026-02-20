import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu } from './ContextMenu'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeArrow, makeTable } from '@/test/boardObjectFactory'

describe('ContextMenu', () => {
  it('renders Duplicate and Delete for unlocked rectangle', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        objects,
        isObjectLocked: () => false,
        activeGroupId: null,
      },
      mutationsValue: {
        onDelete,
        onDuplicate,
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={onClose}
        />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('calls onDuplicate and onClose when Duplicate is clicked', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const onDuplicate = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDuplicate,
        onDelete: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={onClose}
        />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete and onClose when Delete is clicked', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const onClose = vi.fn()
    const onDelete = vi.fn()
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete,
        onDuplicate: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={onClose}
        />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows Lock when canLock and not locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: true,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={vi.fn()}
        />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /lock/i })).toBeInTheDocument()
  })

  it('shows Unlock when canUnlock and locked', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => true, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: true,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={vi.fn()}
        />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })

  it('shows table operations for table type', () => {
    const tableObj = makeTable({ id: 'obj-1' })
    const objects = new Map([['obj-1', tableObj]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        onAddRow: vi.fn(),
        onDeleteRow: vi.fn(),
        onAddColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={vi.fn()}
        />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete row/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add column/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete column/i })).toBeInTheDocument()
  })

  it('shows marker options for line/arrow types', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        onMarkerChange: vi.fn(),
        canGroup: false,
        canUngroup: false,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={vi.fn()}
        />
      </Wrapper>
    )
    expect(screen.getByText('Start marker')).toBeInTheDocument()
    expect(screen.getByText('End marker')).toBeInTheDocument()
  })

  it('shows Group and Ungroup when canGroup or canUngroup', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { objects, isObjectLocked: () => false, activeGroupId: null },
      mutationsValue: {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        onGroup: vi.fn(),
        onUngroup: vi.fn(),
        canGroup: true,
        canUngroup: true,
        canLock: false,
        canUnlock: false,
        canEditVertices: false,
      },
    })

    render(
      <Wrapper>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          objectId="obj-1"
          onClose={vi.fn()}
        />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /^Group/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ungroup/ })).toBeInTheDocument()
  })
})
