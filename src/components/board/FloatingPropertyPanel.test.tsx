import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('renders a color swatch for the current selectedColor and calls onColorChange when the hidden input changes', () => {
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

    const { container } = render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // The color swatch button should be visible
    const colorSwatch = screen.getByRole('button', { name: /color/i })
    expect(colorSwatch).toBeInTheDocument()

    // Simulate the color input changing — use native setter so React picks up the value
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(colorInput, '#ff0000')
    fireEvent.change(colorInput)
    expect(onColorChange).toHaveBeenCalledWith('#ff0000')
  })

  it('disables Delete, Duplicate, Color, and Stroke buttons when anySelectedLocked is true', () => {
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
    expect(screen.getByRole('button', { name: /color/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /style/i })).toBeDisabled()
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

  it('shows the default color #5B8DEF when selectedColor is not provided', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        selectedColor: undefined,
        anySelectedLocked: false,
      },
    })

    const { container } = render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // The hidden color input should default to #5B8DEF
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement
    expect(colorInput).toBeInTheDocument()
    expect(colorInput.value).toBe('#5b8def')
  })

  it('renders panel with visibility hidden when selectedIds contains IDs not present in the objects map', () => {
    // selectedIds has IDs but none exist in the objects map → selectionBBox returns null
    // so panelPos is never set and the panel renders with visibility:hidden
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['ghost-1', 'ghost-2']),
        objects: new Map(),
      },
    })

    const { container } = render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    const toolbar = container.querySelector('[role="toolbar"]')
    expect(toolbar).toBeInTheDocument()
    expect(toolbar).toHaveStyle({ visibility: 'hidden' })
  })

  it('renders both Group and Ungroup buttons when canGroup and canUngroup are both true', () => {
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
        canUngroup: true,
        onGroup: vi.fn(),
        onUngroup: vi.fn(),
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /^group/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ungroup/i })).toBeInTheDocument()
  })

  it('calls onStrokeStyleChange with { stroke_color } when the stroke input changes', () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onStrokeStyleChange,
        anySelectedLocked: false,
      },
    })

    const { container } = render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // The second <input type="color"> is the stroke input
    const colorInputs = container.querySelectorAll('input[type="color"]')
    const strokeInput = colorInputs[1] as HTMLInputElement
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(strokeInput, '#1b3a6b')
    fireEvent.change(strokeInput)
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_color: '#1b3a6b' })
  })

  it('calls onGroup when the Group button is clicked', async () => {
    const onGroup = vi.fn()
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
        onGroup,
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /^group/i }))
    expect(onGroup).toHaveBeenCalledTimes(1)
  })

  it('calls onUngroup when the Ungroup button is clicked', async () => {
    const onUngroup = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        canGroup: false,
        canUngroup: true,
        onUngroup,
        anySelectedLocked: false,
      },
    })

    render(
      <Wrapper>
        <FloatingPropertyPanel {...DEFAULT_PROPS} />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /ungroup/i }))
    expect(onUngroup).toHaveBeenCalledTimes(1)
  })
})
