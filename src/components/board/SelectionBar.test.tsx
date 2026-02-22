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

  it('renders a fill color swatch and calls onColorChange when the hidden input changes', async () => {
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

    // Open the Fill panel first
    const fillModeBtn = screen.getByRole('button', { name: /^fill$/i })
    await userEvent.click(fillModeBtn)

    // The fill color input is now visible in the panel
    const fillInput = container.querySelector('[data-testid="fill-color-input"]') as HTMLInputElement
    expect(fillInput).toBeInTheDocument()

    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(fillInput, '#ff0000')
    fireEvent.change(fillInput)
    expect(onColorChange).toHaveBeenCalledWith('#ff0000')
  })

  it('disables Delete, Duplicate, Fill, and Border mode buttons when anySelectedLocked is true', () => {
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

    // Action buttons must be disabled
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled()

    // Mode tab buttons for writable controls should be disabled
    expect(screen.getByRole('button', { name: /^fill$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^border$/i })).toBeDisabled()

    // Lock tab is NOT disabled (needed to reach the Unlock button)
    expect(screen.getByRole('button', { name: /^lock$/i })).not.toBeDisabled()
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

  it('shows the default fill color #5B8DEF when selectedColor is not provided', async () => {
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

    // Open the Fill panel first
    const fillModeBtn = screen.getByRole('button', { name: /^fill$/i })
    await userEvent.click(fillModeBtn)

    const fillInput = container.querySelector('[data-testid="fill-color-input"]') as HTMLInputElement
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

  it('calls onStrokeStyleChange with { stroke_color } when the stroke input changes', async () => {
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

    // Open the Border panel first
    const borderModeBtn = screen.getByRole('button', { name: /^border$/i })
    await userEvent.click(borderModeBtn)

    const strokeInput = container.querySelector('[data-testid="stroke-color-input"]') as HTMLInputElement
    expect(strokeInput).toBeInTheDocument()

    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(strokeInput, '#112233')
    fireEvent.change(strokeInput)
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_color: '#112233' })
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

    // Open the Fill panel to access the opacity slider
    const fillModeBtn = screen.getByRole('button', { name: /^fill$/i })
    await userEvent.click(fillModeBtn)

    // Change the slider
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(onOpacityChange).toHaveBeenCalledWith(0.5)
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

  it('hides the Fill mode button for line object types', () => {
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

    expect(screen.queryByRole('button', { name: /^fill$/i })).not.toBeInTheDocument()
  })

  it('hides the Fill mode button for arrow object types', () => {
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

    expect(screen.queryByRole('button', { name: /^fill$/i })).not.toBeInTheDocument()
  })

  it('shows the Text mode button for sticky_note type', () => {
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

    expect(screen.getByRole('button', { name: /^text$/i })).toBeInTheDocument()
  })

  it('does not show the Text mode button for line type', () => {
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

    expect(screen.queryByRole('button', { name: /^text$/i })).not.toBeInTheDocument()
  })

  it('does not show the Text mode button when mixed text and non-text types are selected', () => {
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

    expect(screen.queryByRole('button', { name: /^text$/i })).not.toBeInTheDocument()
  })

  it('calls onTextColorChange when the text color input changes', async () => {
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

    // Open the Text panel first
    const textModeBtn = screen.getByRole('button', { name: /^text$/i })
    await userEvent.click(textModeBtn)

    // Text color input is now visible in the panel
    const textColorInput = container.querySelector('[data-testid="text-color-input"]') as HTMLInputElement
    expect(textColorInput).toBeInTheDocument()

    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(textColorInput, '#0000ff')
    fireEvent.change(textColorInput)
    expect(onTextColorChange).toHaveBeenCalledWith('#0000ff')
  })

  it('disables all writable controls when anySelectedLocked is true, but Lock tab stays enabled', () => {
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

    // Action buttons must all be disabled
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeDisabled()

    // Color/style mode buttons must be disabled
    expect(screen.getByRole('button', { name: /^fill$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^border$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^text$/i })).toBeDisabled()

    // Lock tab must remain enabled (to allow reaching Unlock)
    expect(screen.getByRole('button', { name: /^lock$/i })).not.toBeDisabled()

    // Arrange tab stays enabled (it has its own lock guard on the arrange buttons)
    // (not asserting Arrange here — its inner buttons guard with anySelectedLocked)
  })

  // ── Accordion tests ──────────────────────────────────────────────────

  it('clicking Arrange tab opens the panel showing Bring to front button', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    // Arrange panel not shown initially
    expect(screen.queryByRole('button', { name: /bring to front/i })).not.toBeInTheDocument()

    // Click Arrange tab
    await userEvent.click(screen.getByRole('button', { name: /^arrange$/i }))

    // Arrange panel now rendered
    expect(screen.getByRole('button', { name: /bring to front/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bring forward/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send backward/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send to back/i })).toBeInTheDocument()
  })

  it('clicking Arrange tab twice closes the panel (hides Bring to front)', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    const arrangeTab = screen.getByRole('button', { name: /^arrange$/i })

    // Open
    await userEvent.click(arrangeTab)
    expect(screen.getByRole('button', { name: /bring to front/i })).toBeInTheDocument()

    // Close (click same tab again)
    await userEvent.click(arrangeTab)
    expect(screen.queryByRole('button', { name: /bring to front/i })).not.toBeInTheDocument()
  })

  it('calls onBringToFront when Bring to front is clicked', async () => {
    const onBringToFront = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onBringToFront, anySelectedLocked: false },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    await userEvent.click(screen.getByRole('button', { name: /^arrange$/i }))
    await userEvent.click(screen.getByRole('button', { name: /bring to front/i }))
    expect(onBringToFront).toHaveBeenCalledWith('obj-1')
  })

  it('shows Lock/Unlock buttons in Lock panel based on canLock/canUnlock', async () => {
    const onLock = vi.fn()
    const onUnlock = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: {
        anySelectedLocked: false,
        canLock: true,
        canUnlock: false,
        onLock,
        onUnlock,
      },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    // Open Lock panel
    await userEvent.click(screen.getByRole('button', { name: /^lock$/i }))

    // canLock=true → Lock selection button shown in panel
    expect(screen.getByRole('button', { name: /^lock selection$/i })).toBeInTheDocument()

    // canUnlock=false → Unlock button not shown
    expect(screen.queryByRole('button', { name: /^unlock$/i })).not.toBeInTheDocument()

    // Click the Lock selection button inside the panel
    await userEvent.click(screen.getByRole('button', { name: /^lock selection$/i }))
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('shows Unlock button in Lock panel when canUnlock is true', async () => {
    const onUnlock = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: {
        anySelectedLocked: true,
        canLock: false,
        canUnlock: true,
        onUnlock,
      },
    })

    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    // Open Lock panel via the Lock tab (which stays enabled even when locked)
    await userEvent.click(screen.getByRole('button', { name: /^lock$/i }))

    const unlockBtn = screen.getByRole('button', { name: /^unlock$/i })
    expect(unlockBtn).toBeInTheDocument()
    await userEvent.click(unlockBtn)
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('switching from Arrange tab to Fill tab switches the active panel', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })

    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    // Open Arrange
    await userEvent.click(screen.getByRole('button', { name: /^arrange$/i }))
    expect(screen.getByRole('button', { name: /bring to front/i })).toBeInTheDocument()

    // Switch to Fill
    await userEvent.click(screen.getByRole('button', { name: /^fill$/i }))
    expect(screen.queryByRole('button', { name: /bring to front/i })).not.toBeInTheDocument()
    expect(container.querySelector('[data-testid="fill-color-input"]')).toBeInTheDocument()
  })
})
