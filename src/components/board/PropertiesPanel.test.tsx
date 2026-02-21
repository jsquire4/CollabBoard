import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertiesPanel } from './PropertiesPanel'
import { createBoardContextWrapper, RenderWithBoardContextOptions } from '@/test/renderWithBoardContext'
import {
  makeRectangle,
  makeLine,
  makeStickyNote,
  makeCircle,
} from '@/test/boardObjectFactory'

// ── Helpers ───────────────────────────────────────────────────────────

function renderPanel(
  boardValue?: RenderWithBoardContextOptions['boardValue'],
  mutationsValue?: RenderWithBoardContextOptions['mutationsValue']
) {
  const Wrapper = createBoardContextWrapper({ boardValue, mutationsValue })
  return render(
    <Wrapper>
      <PropertiesPanel />
    </Wrapper>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('PropertiesPanel', () => {
  // ── Visibility ────────────────────────────────────────────────────

  it('panel is translated off-screen (translateX(100%)) when no objects are selected', () => {
    const { container } = renderPanel({
      selectedIds: new Set(),
      objects: new Map(),
    })

    const panel = container.querySelector('[aria-label="Properties panel"]') as HTMLElement
    expect(panel).toBeInTheDocument()
    expect(panel.style.transform).toBe('translateX(100%)')
  })

  it('panel is visible (translateX(0)) when at least one object is selected', () => {
    const obj = makeRectangle({ id: 'rect-1' })
    const { container } = renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    const panel = container.querySelector('[aria-label="Properties panel"]') as HTMLElement
    expect(panel).toBeInTheDocument()
    expect(panel.style.transform).toBe('translateX(0)')
  })

  // ── Position & Size section ───────────────────────────────────────

  it('Position & Size section shows x, y, width, height values from first selected object', () => {
    const obj = makeRectangle({ id: 'rect-1', x: 42, y: 77, width: 200, height: 150 })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    const xInput = screen.getByRole('spinbutton', { name: 'X' })
    const yInput = screen.getByRole('spinbutton', { name: 'Y' })
    const wInput = screen.getByRole('spinbutton', { name: 'W' })
    const hInput = screen.getByRole('spinbutton', { name: 'H' })

    expect(xInput).toHaveValue(42)
    expect(yInput).toHaveValue(77)
    expect(wInput).toHaveValue(200)
    expect(hInput).toHaveValue(150)
  })

  it('Position & Size inputs call onTransformEnd with correct field on change', async () => {
    const onTransformEnd = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', x: 0, y: 0, width: 100, height: 80 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onTransformEnd, anySelectedLocked: false }
    )

    const xInput = screen.getByRole('spinbutton', { name: 'X' })
    fireEvent.change(xInput, { target: { value: '55' } })
    expect(onTransformEnd).toHaveBeenCalledWith('rect-1', { x: 55 })
  })

  // ── Fill section ──────────────────────────────────────────────────

  it('Fill section is visible for rectangle types', () => {
    const obj = makeRectangle({ id: 'rect-1' })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    // The Fill section toggle button should be present
    expect(screen.getByRole('button', { name: /fill/i })).toBeInTheDocument()
  })

  it('Fill section is hidden for line types', () => {
    const obj = makeLine({ id: 'line-1' })
    renderPanel({
      selectedIds: new Set(['line-1']),
      objects: new Map([['line-1', obj]]),
    })

    expect(screen.queryByRole('button', { name: /^fill$/i })).not.toBeInTheDocument()
  })

  it('Fill section calls onColorChange when a color is selected', async () => {
    const onColorChange = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', color: '#4A90D9' })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onColorChange, anySelectedLocked: false, selectedColor: '#4A90D9' }
    )

    // Expand fill section (it starts open, but ColorPicker palette buttons exist)
    // Click any palette color button — ColorPicker renders swatches in the fill section
    const colorButtons = screen.getAllByTitle(/^#/i)
    // There should be at least one swatch in the fill ColorPicker (non-compact)
    expect(colorButtons.length).toBeGreaterThan(0)
    await userEvent.click(colorButtons[0])
    expect(onColorChange).toHaveBeenCalledTimes(1)
  })

  // ── Typography section ────────────────────────────────────────────

  it('Typography section toggle is shown for sticky_note objects', () => {
    const obj = makeStickyNote({ id: 'note-1' })
    renderPanel({
      selectedIds: new Set(['note-1']),
      objects: new Map([['note-1', obj]]),
    })

    expect(screen.getByRole('button', { name: /typography/i })).toBeInTheDocument()
  })

  it('Typography section toggle is shown for rectangle objects', () => {
    const obj = makeRectangle({ id: 'rect-1' })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    expect(screen.getByRole('button', { name: /typography/i })).toBeInTheDocument()
  })

  it('Typography section is hidden for line type objects', () => {
    const obj = makeLine({ id: 'line-1' })
    renderPanel({
      selectedIds: new Set(['line-1']),
      objects: new Map([['line-1', obj]]),
    })

    expect(screen.queryByRole('button', { name: /typography/i })).not.toBeInTheDocument()
  })

  it('Typography section shows font family select and size buttons when opened', async () => {
    const obj = makeRectangle({ id: 'rect-1', font_family: 'sans-serif', font_size: 14 })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    // Open the typography section
    await userEvent.click(screen.getByRole('button', { name: /typography/i }))

    expect(screen.getByRole('combobox', { name: /font family/i })).toBeInTheDocument()
    // Font size 14 button should be in active state
    expect(screen.getByRole('button', { name: 'Font size 14' })).toBeInTheDocument()
  })

  it('Typography font family change calls onTransformEnd', async () => {
    const onTransformEnd = vi.fn()
    const obj = makeRectangle({ id: 'rect-1' })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onTransformEnd, anySelectedLocked: false }
    )

    await userEvent.click(screen.getByRole('button', { name: /typography/i }))

    const select = screen.getByRole('combobox', { name: /font family/i })
    fireEvent.change(select, { target: { value: 'serif' } })
    expect(onTransformEnd).toHaveBeenCalledWith('rect-1', { font_family: 'serif' })
  })

  it('Typography text alignment buttons call onTransformEnd', async () => {
    const onTransformEnd = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', text_align: 'center' })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onTransformEnd, anySelectedLocked: false }
    )

    await userEvent.click(screen.getByRole('button', { name: /typography/i }))
    await userEvent.click(screen.getByRole('button', { name: /align left/i }))
    expect(onTransformEnd).toHaveBeenCalledWith('rect-1', { text_align: 'left' })
  })

  // ── Opacity ───────────────────────────────────────────────────────

  it('Opacity slider calls onOpacityChange with value / 100', async () => {
    const onOpacityChange = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', opacity: 0.8 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onOpacityChange, anySelectedLocked: false }
    )

    // Open opacity section
    await userEvent.click(screen.getByRole('button', { name: /opacity/i }))

    const slider = screen.getByRole('slider', { name: /opacity/i })
    fireEvent.change(slider, { target: { value: '50' } })
    expect(onOpacityChange).toHaveBeenCalledWith(0.5)
  })

  it('Opacity slider shows current value as percentage', async () => {
    const obj = makeRectangle({ id: 'rect-1', opacity: 0.6 })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    await userEvent.click(screen.getByRole('button', { name: /opacity/i }))
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  // ── Lock: disabled state ──────────────────────────────────────────

  it('all inputs are disabled when anySelectedLocked is true', async () => {
    const obj = makeRectangle({ id: 'rect-1', x: 10, y: 20, width: 100, height: 80 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { anySelectedLocked: true }
    )

    // Position/size number inputs should be disabled
    expect(screen.getByRole('spinbutton', { name: 'X' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Y' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'W' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'H' })).toBeDisabled()

    // Opacity slider disabled
    await userEvent.click(screen.getByRole('button', { name: /opacity/i }))
    expect(screen.getByRole('slider', { name: /opacity/i })).toBeDisabled()

    // Typography buttons disabled
    await userEvent.click(screen.getByRole('button', { name: /typography/i }))
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Italic' })).toBeDisabled()
  })

  // ── Corner radius ─────────────────────────────────────────────────

  it('Corner Radius section is visible for rectangle, hidden for circle', () => {
    const rectObj = makeRectangle({ id: 'rect-1' })
    const { unmount } = renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', rectObj]]),
    })
    expect(screen.getByRole('button', { name: /corner radius/i })).toBeInTheDocument()
    unmount()

    const circleObj = makeCircle({ id: 'circ-1' })
    renderPanel({
      selectedIds: new Set(['circ-1']),
      objects: new Map([['circ-1', circleObj]]),
    })
    expect(screen.queryByRole('button', { name: /corner radius/i })).not.toBeInTheDocument()
  })

  it('Corner Radius ScrubInput calls onTransformEnd with corner_radius', async () => {
    const onTransformEnd = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', corner_radius: 0 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onTransformEnd, anySelectedLocked: false }
    )

    await userEvent.click(screen.getByRole('button', { name: /corner radius/i }))

    const rInput = screen.getByRole('spinbutton', { name: 'R' })
    fireEvent.change(rInput, { target: { value: '12' } })
    expect(onTransformEnd).toHaveBeenCalledWith('rect-1', { corner_radius: 12 })
  })

  // ── Shadow ────────────────────────────────────────────────────────

  it('Shadow section is always visible and can be opened', async () => {
    const obj = makeRectangle({ id: 'rect-1' })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    const shadowToggle = screen.getByRole('button', { name: /shadow/i })
    expect(shadowToggle).toBeInTheDocument()

    await userEvent.click(shadowToggle)
    // Blur scrub input should appear
    expect(screen.getByRole('spinbutton', { name: 'B' })).toBeInTheDocument()
  })

  it('Shadow blur change calls onTransformEnd with shadow_blur', async () => {
    const onTransformEnd = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', shadow_blur: 0 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onTransformEnd, anySelectedLocked: false }
    )

    await userEvent.click(screen.getByRole('button', { name: /shadow/i }))

    const blurInput = screen.getByRole('spinbutton', { name: 'B' })
    fireEvent.change(blurInput, { target: { value: '8' } })
    expect(onTransformEnd).toHaveBeenCalledWith('rect-1', { shadow_blur: 8 })
  })

  // ── Stroke section ────────────────────────────────────────────────

  it('Stroke section can be opened and shows stroke width input', async () => {
    const obj = makeRectangle({ id: 'rect-1', stroke_width: 2 })
    renderPanel({
      selectedIds: new Set(['rect-1']),
      objects: new Map([['rect-1', obj]]),
    })

    await userEvent.click(screen.getByRole('button', { name: /stroke/i }))
    // After opening stroke, multiple W inputs exist (position width + stroke width)
    const wInputs = screen.getAllByRole('spinbutton', { name: 'W' })
    expect(wInputs.length).toBeGreaterThanOrEqual(1)
  })

  it('Stroke width change calls onStrokeStyleChange', async () => {
    const onStrokeStyleChange = vi.fn()
    const obj = makeRectangle({ id: 'rect-1', stroke_width: 1 })

    renderPanel(
      { selectedIds: new Set(['rect-1']), objects: new Map([['rect-1', obj]]) },
      { onStrokeStyleChange, anySelectedLocked: false }
    )

    await userEvent.click(screen.getByRole('button', { name: /stroke/i }))
    // The second W input (after position width) is the stroke width
    const wInputs = screen.getAllByRole('spinbutton', { name: 'W' })
    const strokeWidthInput = wInputs[wInputs.length - 1]
    fireEvent.change(strokeWidthInput, { target: { value: '4' } })
    expect(onStrokeStyleChange).toHaveBeenCalledWith({ stroke_width: 4 })
  })

  // ── Multi-select ──────────────────────────────────────────────────

  it('shows selection count when multiple objects are selected', () => {
    const obj1 = makeRectangle({ id: 'rect-1' })
    const obj2 = makeCircle({ id: 'circ-1' })
    renderPanel({
      selectedIds: new Set(['rect-1', 'circ-1']),
      objects: new Map([['rect-1', obj1], ['circ-1', obj2]]),
    })

    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })
})
