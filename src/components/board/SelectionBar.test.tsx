import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionBar } from './SelectionBar'
import { createBoardContextWrapper } from '@/test/renderWithBoardContext'
import { makeRectangle, makeCircle, makeLine, makeArrow, makeStickyNote } from '@/test/boardObjectFactory'

const DEFAULT_PROPS = {
  stagePos: { x: 0, y: 0 },
  stageScale: 1,
}

describe('SelectionBar', () => {
  // ── Basic rendering ────────────────────────────────────────────────

  it('renders nothing when selectedIds is empty', () => {
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(), objects: new Map() },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(container.firstChild).toBeNull()
  })

  it('renders the bar when selectedIds has items', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('renders bar with visibility hidden for ghost IDs', () => {
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['ghost-1']), objects: new Map() },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(container.querySelector('[role="toolbar"]')).toHaveStyle({ visibility: 'hidden' })
  })

  // ── Row 1 composition ──────────────────────────────────────────────

  it('renders Text and Shape Format group buttons, not context-menu actions', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(screen.getByRole('button', { name: /^text$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^shape format$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /duplicate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^lock$/i })).not.toBeInTheDocument()
  })

  // ── Shape Format — shapes: Fill + Border ──────────────────────────

  it('Shape Format shows Fill, Color, Weight, Dash sub-groups for shapes', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    expect(screen.getByRole('button', { name: /^fill$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^color$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^weight$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dash$/i })).toBeInTheDocument()
    // No line-specific sub-groups
    expect(screen.queryByRole('button', { name: /^border$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument()
  })

  it('Fill dropdown: color presets, custom picker, opacity slider', async () => {
    const onColorChange = vi.fn()
    const onOpacityChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', opacity: 0.8 })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onColorChange, onOpacityChange, selectedColor: '#EF4444', anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^fill$/i }))

    expect(screen.getByRole('button', { name: /fill color #ffffff/i })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="fill-color-input"]')).toBeInTheDocument()
    const slider = container.querySelector('input[aria-label="Opacity"]') as HTMLInputElement
    expect(slider).toBeInTheDocument()

    // Preset click
    await userEvent.click(screen.getByRole('button', { name: /fill color #ef4444/i }))
    expect(onColorChange).toHaveBeenCalledWith('#ef4444')

    // Opacity slider
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(onOpacityChange).toHaveBeenCalledWith(0.5)
  })

  it('Shape Color dropdown: presets, custom picker (no endpoints)', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^color$/i }))

    expect(screen.getByRole('button', { name: /stroke color #000000/i })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="stroke-color-input"]')).toBeInTheDocument()
    // No endpoint selectors for shapes
    expect(screen.queryByRole('button', { name: /^start none$/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /stroke color #000000/i }))
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_color: '#000000' })
  })

  it('Shape Weight dropdown shows slider', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^weight$/i }))

    const slider = container.querySelector('input[aria-label="Line weight"]') as HTMLInputElement
    expect(slider).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '8' } })
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_width: 8 })
  })

  it('Shape Dash dropdown shows presets', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^dash$/i }))

    expect(screen.getByRole('button', { name: /solid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dashed$/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /dashed$/i }))
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_dash: '[8,4]' })
  })

  // ── Shape Format — lines: Color, Weight, Dash, Start, End ─────────

  it('Shape Format shows Color, Weight, Dash, Start, End sub-groups for lines', async () => {
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))

    expect(screen.getByRole('button', { name: /^color$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^weight$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dash$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^end$/i })).toBeInTheDocument()
    // No shape-specific sub-groups
    expect(screen.queryByRole('button', { name: /^fill$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^border$/i })).not.toBeInTheDocument()
  })

  it('Color dropdown shows line color presets and custom picker', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^color$/i }))

    expect(screen.getByRole('button', { name: /stroke color #ffffff/i })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="stroke-color-input"]')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /stroke color #ef4444/i }))
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_color: '#ef4444' })
  })

  it('Weight dropdown shows weight slider for lines', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^weight$/i }))

    const slider = container.querySelector('input[aria-label="Line weight"]') as HTMLInputElement
    expect(slider).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '6' } })
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_width: 6 })
  })

  it('Dash dropdown shows dash presets for lines', async () => {
    const onStrokeStyleChange = vi.fn()
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onStrokeStyleChange, anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^dash$/i }))

    expect(screen.getByRole('button', { name: /solid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dashed$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dotted/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /dashed$/i }))
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_dash: '[8,4]' })
  })

  it('Start dropdown shows marker options and calls onMarkerChange', async () => {
    const onMarkerChange = vi.fn()
    const objects = new Map([['obj-1', makeLine({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onMarkerChange, anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^start$/i }))

    expect(screen.getByRole('button', { name: /^start none$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^start arrow$/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^start arrow$/i }))
    expect(onMarkerChange).toHaveBeenCalledWith({ marker_start: 'arrow' })
  })

  it('End dropdown shows marker options and calls onMarkerChange', async () => {
    const onMarkerChange = vi.fn()
    const objects = new Map([['obj-1', makeArrow({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onMarkerChange, anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^end$/i }))

    expect(screen.getByRole('button', { name: /^end none$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^end circle$/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^end circle$/i }))
    expect(onMarkerChange).toHaveBeenCalledWith({ marker_end: 'circle' })
  })

  // ── Disabled state ─────────────────────────────────────────────────

  it('disables Shape Format and Text when anySelectedLocked is true', () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: true },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)
    expect(screen.getByRole('button', { name: /^shape format$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^text$/i })).toBeDisabled()
  })

  // ── Text button visibility ─────────────────────────────────────────

  it('shows Text for rectangle, hides for sticky_note and line', () => {
    const rectObjects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const RectWrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects: rectObjects },
      mutationsValue: { anySelectedLocked: false },
    })
    const { unmount } = render(<RectWrapper><SelectionBar {...DEFAULT_PROPS} /></RectWrapper>)
    expect(screen.getByRole('button', { name: /^text$/i })).toBeInTheDocument()
    unmount()

    const stickyObjects = new Map([['obj-1', makeStickyNote({ id: 'obj-1' })]])
    const StickyWrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects: stickyObjects },
      mutationsValue: { anySelectedLocked: false },
    })
    render(<StickyWrapper><SelectionBar {...DEFAULT_PROPS} /></StickyWrapper>)
    expect(screen.queryByRole('button', { name: /^text$/i })).not.toBeInTheDocument()
  })

  it('shows text color via Text > Color sub-group', async () => {
    const onTextColorChange = vi.fn()
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1', text_color: '#FF0000' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { onTextColorChange, anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    await userEvent.click(screen.getByRole('button', { name: /^text$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^color$/i }))

    const textColorInput = container.querySelector('[data-testid="text-color-input"]') as HTMLInputElement
    expect(textColorInput).toBeInTheDocument()

    vi.useFakeTimers()
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    nativeSet.call(textColorInput, '#0000ff')
    fireEvent.change(textColorInput)
    act(() => { vi.runAllTimers() })
    vi.useRealTimers()
    expect(onTextColorChange).toHaveBeenCalledWith('#0000ff')
  })

  // ── Sub-group toggling ────────────────────────────────────────────

  it('clicking a sub-group twice collapses its dropdown', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })
    const { container } = render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^fill$/i }))
    expect(container.querySelector('[data-testid="sub-dropdown-fmt-fill"]')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^fill$/i }))
    expect(container.querySelector('[data-testid="sub-dropdown-fmt-fill"]')).not.toBeInTheDocument()
  })

  it('switching from Text to Shape Format hides text sub-groups and shows format sub-groups', async () => {
    const objects = new Map([['obj-1', makeRectangle({ id: 'obj-1' })]])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1']), objects },
      mutationsValue: { anySelectedLocked: false },
    })
    render(<Wrapper><SelectionBar {...DEFAULT_PROPS} /></Wrapper>)

    await userEvent.click(screen.getByRole('button', { name: /^text$/i }))
    expect(screen.getByRole('button', { name: /^font$/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^shape format$/i }))
    expect(screen.queryByRole('button', { name: /^font$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^fill$/i })).toBeInTheDocument()
  })

  // ── Positioning ────────────────────────────────────────────────────

  it('renders toolbar for multi-object selection', () => {
    const objects = new Map([
      ['obj-1', makeRectangle({ id: 'obj-1' })],
      ['obj-2', makeCircle({ id: 'obj-2' })],
    ])
    const Wrapper = createBoardContextWrapper({
      boardValue: { selectedIds: new Set(['obj-1', 'obj-2']), objects },
    })
    render(<Wrapper><SelectionBar stagePos={{ x: 50, y: 30 }} stageScale={2} /></Wrapper>)
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })
})
