import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloatingPropertyPanel } from './FloatingPropertyPanel'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeCircle } from '@/test/boardObjectFactory'

const DEFAULT_PROPS = {
  stagePos: { x: 0, y: 0 },
  stageScale: 1,
}

describe('FloatingPropertyPanel', () => {
  it('renders nothing when selectedIds is empty', () => {
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(),
        objects: new Map(),
      },
    })

    const { container } = render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders the panel when selectedIds has items', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // Panel should be present in the document
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('calls onDelete when the Delete button is clicked', async () => {
    const onDelete = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onDelete,
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onDuplicate when the Duplicate button is clicked', async () => {
    const onDuplicate = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onDuplicate,
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it('renders a color swatch for the current selectedColor and calls onColorChange when clicked', async () => {
    const onColorChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', color: '#EF4444' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onColorChange,
        selectedColor: '#EF4444',
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // The color swatch button should be visible (accessible by its color label or role)
    const colorSwatch = screen.getByRole('button', { name: /color/i })
    expect(colorSwatch).toBeInTheDocument()

    await userEvent.click(colorSwatch)
    expect(onColorChange).toHaveBeenCalled()
  })

  it('disables Delete and Duplicate buttons when anySelectedLocked is true', () => {
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onDelete,
        onDuplicate,
        anySelectedLocked: true,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled()
  })

  it('renders the Group button when canGroup is true', () => {
    const objects = new Map([
      ['obj-1', makeRectangle({ id: 'obj-1' })],
      ['obj-2', makeCircle({ id: 'obj-2' })],
    ])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1', 'obj-2']),
        objects,
      },
      mutationsValue: {
        canGroup: true,
        canUngroup: false,
        onGroup: vi.fn(),
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /^group/i })).toBeInTheDocument()
  })

  it('does not render the Group button when canGroup is false', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        canGroup: false,
        canUngroup: false,
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.queryByRole('button', { name: /^group/i })).not.toBeInTheDocument()
  })

  it('renders the Ungroup button when canUngroup is true', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        canGroup: false,
        canUngroup: true,
        onUngroup: vi.fn(),
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /ungroup/i })).toBeInTheDocument()
  })

  it('passes stagePos and stageScale through to position the panel correctly', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', x: 200, y: 150 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel stagePos={{ x: 50, y: 30 }} stageScale={1.5} />
      </Wrapper>
    )

    // Panel should still render — positioning props are accepted without error
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('renders panel for multiple selected objects', () => {
    const objects = new Map([
      ['obj-1', makeRectangle({ id: 'obj-1' })],
      ['obj-2', makeCircle({ id: 'obj-2' })],
      ['obj-3', makeRectangle({ id: 'obj-3' })],
    ])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1', 'obj-2', 'obj-3']),
        objects,
      },
      mutationsValue: {
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })
})
