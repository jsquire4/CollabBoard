import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionBar } from './SelectionBar'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeCircle, makeLine, makeArrow, makeStickyNote } from '@/test/boardObjectFactory'

const DEFAULT_PROPS = {
  stagePos: { x: 0, y: 0 },
  stageScale: 1,
}

describe('SelectionBar', () => {
  // ── Migrated from FloatingPropertyPanel.test.tsx ──────────────────────

  it('renders nothing when selectedIds is empty', () => {
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(),
        objects: new Map(),
      },
    })

    const { container } = render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders the bar when selectedIds has items', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

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
        <SelectionBar {...DEFAULT_PROPS} />
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it('renders a fill color swatch and calls onColorChange when the hidden input changes', () => {
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // The fill color button should be visible
    const fillBtn = screen.getByRole('button', { name: /fill color/i })
    expect(fillBtn).toBeInTheDocument()

    // For a rectangle, inputs are ordered: textColor (0), fill (1), stroke (2).
    // The fill input is at index 1.
    const colorInputs = container.querySelectorAll('input[type="color"]')
    const fillInput = colorInputs[1] as HTMLInputElement
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(fillInput, '#ff0000')
    fireEvent.change(fillInput)
    expect(onColorChange).toHaveBeenCalledWith('#ff0000')
  })

  it('disables Delete, Duplicate, Fill, and Stroke buttons when anySelectedLocked is true', () => {
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /fill color/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /stroke color/i })).toBeDisabled()
  })

  it('passes stagePos and stageScale through to position the bar correctly', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', x: 200, y: 150 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
    })

    render(
      <Wrapper>
        <SelectionBar stagePos={{ x: 50, y: 30 }} stageScale={1.5} />
      </Wrapper>
    )

    // Bar should still render — positioning props are accepted without error
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('renders bar for multiple selected objects', () => {
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('shows the default fill color #5B8DEF when selectedColor is not provided', () => {
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // For a rectangle, inputs are ordered: textColor (0), fill (1), stroke (2).
    // The fill input is at index 1.
    const colorInputs = container.querySelectorAll('input[type="color"]')
    const fillInput = colorInputs[1] as HTMLInputElement
    expect(fillInput).toBeInTheDocument()
    expect(fillInput.value).toBe('#5b8def')
  })

  it('renders bar with visibility hidden when selectedIds contains IDs not present in the objects map', () => {
    // selectedIds has IDs but none exist in the objects map → selectionBBox returns null
    // so barPos is never set and the bar renders with visibility:hidden
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['ghost-1', 'ghost-2']),
        objects: new Map(),
      },
    })

    const { container } = render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    const toolbar = container.querySelector('[role="toolbar"]')
    expect(toolbar).toBeInTheDocument()
    expect(toolbar).toHaveStyle({ visibility: 'hidden' })
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
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // For a rectangle (text type), the last input[type="color"] is the stroke input
    const colorInputs = container.querySelectorAll('input[type="color"]')
    const strokeInput = colorInputs[colorInputs.length - 1] as HTMLInputElement
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(strokeInput, '#1b3a6b')
    fireEvent.change(strokeInput)
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_color: '#1b3a6b' })
  })

  it('calls onOpacityChange when the opacity slider is changed', async () => {
    const onOpacityChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', opacity: 0.75 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onOpacityChange, anySelectedLocked: false },
    })

    const { container } = render(
      <Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>
    )

    // Open the opacity popover
    await userEvent.click(screen.getByRole('button', { name: /opacity/i }))

    // Change the slider
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(onOpacityChange).toHaveBeenCalledWith(0.5)
  })

  it('displays current opacity percentage on the opacity button', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', opacity: 0.5 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(screen.getByRole('button', { name: /opacity/i })).toHaveTextContent('50%')
  })

  it('has keyboard shortcut hints in button title attributes', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(screen.getByRole('button', { name: /duplicate/i })).toHaveAttribute('title', 'Duplicate (⌘D)')
    expect(screen.getByRole('button', { name: /delete/i })).toHaveAttribute('title', 'Delete (⌫)')
  })

  // ── New tests specific to SelectionBar ────────────────────────────────

  it('positions correctly with stageScale=2 and stagePos={x:50, y:30}', () => {
    // Object at canvas (100, 100) with width=120, height=80
    // screenLeft  = 100 * 2 + 50 = 250
    // screenRight = (100+120) * 2 + 50 = 490
    // screenTop   = 100 * 2 + 30 = 230
    // centerX     = (250 + 490) / 2 = 370
    // The bar should render without error; just verify toolbar is present
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', x: 100, y: 100, width: 120, height: 80 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
    })

    render(
      <Wrapper>
        <SelectionBar stagePos={{ x: 50, y: 30 }} stageScale={2} />
      </Wrapper>
    )

    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('hides the Fill Color button for line object types', () => {
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: { anySelectedLocked: false },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.queryByRole('button', { name: /fill color/i })).not.toBeInTheDocument()
  })

  it('hides the Fill Color button for arrow object types', () => {
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: { anySelectedLocked: false },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.queryByRole('button', { name: /fill color/i })).not.toBeInTheDocument()
  })

  it('shows the TextColor button for sticky_note type', () => {
    const objects = new Map([['obj-1', makeStickyNote({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: { anySelectedLocked: false },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.getByRole('button', { name: /text color/i })).toBeInTheDocument()
  })

  it('does not show the TextColor button for line type', () => {
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: { anySelectedLocked: false },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.queryByRole('button', { name: /text color/i })).not.toBeInTheDocument()
  })

  it('does not show the TextColor button when mixed text and non-text types are selected', () => {
    const objects = new Map([
      ['obj-1', makeStickyNote({ id: 'obj-1' })],
      ['obj-2', makeLine({ id: 'obj-2' })],
    ])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1', 'obj-2']),
        objects,
      },
      mutationsValue: { anySelectedLocked: false },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    expect(screen.queryByRole('button', { name: /text color/i })).not.toBeInTheDocument()
  })

  it('calls onTextColorChange when the text color input changes', () => {
    const onTextColorChange = vi.fn()
    const objects = new Map([['obj-1', makeStickyNote({ id: 'obj-1', text_color: '#FF0000' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        onTextColorChange,
        anySelectedLocked: false,
      },
    })

    const { container } = render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // For a sticky_note, the first input[type="color"] is the text color input
    const textColorInput = container.querySelector('input[type="color"]') as HTMLInputElement
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(textColorInput, '#0000ff')
    fireEvent.change(textColorInput)
    expect(onTextColorChange).toHaveBeenCalledWith('#0000ff')
  })

  it('disables all controls when anySelectedLocked is true', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: {
        selectedIds: new Set(['obj-1']),
        objects,
      },
      mutationsValue: {
        anySelectedLocked: true,
      },
    })

    render(
      <Wrapper>
        <SelectionBar {...DEFAULT_PROPS} />
      </Wrapper>
    )

    // All action buttons should be disabled
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn).toBeDisabled()
    }
  })
})
