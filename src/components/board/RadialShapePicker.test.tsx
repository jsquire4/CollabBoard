import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RadialShapePicker } from './RadialShapePicker'

// ── Default props ─────────────────────────────────────────────────────────────

const defaultProps = {
  triggerX: 400,
  triggerY: 300,
  canvasX: 200,
  canvasY: 150,
  onDrawShape: vi.fn(),
  onClose: vi.fn(),
}

function renderPicker(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides }
  const onDrawShape = props.onDrawShape
  const onClose = props.onClose
  render(<RadialShapePicker {...props} />)
  return { onDrawShape, onClose }
}

/** Click a group button to reveal its shapes */
function openGroup(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RadialShapePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Smoke test
  it('renders without crashing', () => {
    expect(() => renderPicker()).not.toThrow()
  })

  // 2. Renders 5 group buttons + 1 close button initially
  it('renders 6 buttons (5 groups + close)', () => {
    renderPicker()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(6)
  })

  // 3. Group buttons have aria-labels matching group names
  it('group buttons have correct aria-labels', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: 'Utility' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Shapes' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Lines' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Special' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Flowchart' })).toBeDefined()
  })

  // 4. Clicking Utility group shows its shape buttons
  it('clicking Utility group reveals shape buttons', () => {
    renderPicker()
    openGroup('Utility')
    expect(screen.getByRole('button', { name: /Place Note/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Text/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Frame/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Table/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place File/i })).toBeDefined()
  })

  // 5. Clicking Shapes group shows basic shapes
  it('clicking Shapes group reveals basic shape buttons', () => {
    renderPicker()
    openGroup('Shapes')
    expect(screen.getByRole('button', { name: /Place Rectangle/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Square/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Circle/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Equilateral/i })).toBeDefined()
  })

  // 6. Clicking Lines group shows line/arrow
  it('clicking Lines group reveals line and arrow buttons', () => {
    renderPicker()
    openGroup('Lines')
    expect(screen.getByRole('button', { name: /Place Line/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Place Arrow/i })).toBeDefined()
  })

  // 7. Clicking a shape after opening group calls onDrawShape
  it('clicking Sticky Note calls onDrawShape with sticky_note type', () => {
    const onDrawShape = vi.fn()
    const onClose = vi.fn()
    renderPicker({ onDrawShape, onClose })
    openGroup('Utility')
    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onDrawShape).toHaveBeenCalledWith(
      'sticky_note',
      expect.any(Number),
      expect.any(Number),
      150,
      150,
      undefined,
    )
  })

  // 8. Clicking Rectangle calls onDrawShape
  it('clicking Rectangle calls onDrawShape with rectangle type', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    openGroup('Shapes')
    fireEvent.click(screen.getByRole('button', { name: /Place Rectangle/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onDrawShape).toHaveBeenCalledWith(
      'rectangle',
      expect.any(Number),
      expect.any(Number),
      200,
      140,
      undefined,
    )
  })

  // 9. Clicking a shape calls onClose after onDrawShape
  it('clicking a shape calls onClose after onDrawShape', () => {
    const onDrawShape = vi.fn()
    const onClose = vi.fn()
    renderPicker({ onDrawShape, onClose })
    openGroup('Shapes')
    fireEvent.click(screen.getByRole('button', { name: /Place Circle/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    const drawOrder = onDrawShape.mock.invocationCallOrder[0]
    const closeOrder = onClose.mock.invocationCallOrder[0]
    expect(drawOrder).toBeLessThan(closeOrder)
  })

  // 10. Pressing Escape with no active group calls onClose
  it('pressing Escape calls onClose when no group is open', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 11. Pressing Escape with active group collapses group first
  it('pressing Escape collapses active group before closing picker', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    openGroup('Utility')
    expect(screen.getByRole('button', { name: /Place Note/i })).toBeDefined()
    fireEvent.keyDown(window, { key: 'Escape' })
    // Group collapsed, picker still open
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Place Note/i })).toBeNull()
    // Second Escape closes picker
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 12. Clicking outside calls onClose
  it('mousedown outside the picker calls onClose', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 13. onClose called even if onDrawShape throws
  it('calls onClose even if onDrawShape throws', () => {
    const onClose = vi.fn()
    const onDrawShape = vi.fn(() => {
      throw new Error('draw failed')
    })
    renderPicker({ onDrawShape, onClose })
    openGroup('Utility')
    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 14. Dialog role and aria-label
  it('has a dialog with aria-label "Shape picker"', () => {
    renderPicker()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Shape picker')
  })

  // 15. Viewport clamping near right-bottom edge
  it('clamps left/top to stay within viewport when near right-bottom edge', () => {
    renderPicker({ triggerX: window.innerWidth - 10, triggerY: window.innerHeight - 10 })
    const dialog = screen.getByRole('dialog')
    const styleLeft = parseFloat(dialog.style.left)
    const styleTop = parseFloat(dialog.style.top)
    expect(styleLeft).toBeGreaterThanOrEqual(8)
    expect(styleLeft).toBeLessThanOrEqual(window.innerWidth - 440 - 8)
    expect(styleTop).toBeGreaterThanOrEqual(8)
    expect(styleTop).toBeLessThanOrEqual(window.innerHeight - 440 - 8)
  })

  // 16. Viewport clamping near left-top edge
  it('clamps left/top to stay within viewport when near left-top edge', () => {
    renderPicker({ triggerX: 0, triggerY: 0 })
    const dialog = screen.getByRole('dialog')
    const styleLeft = parseFloat(dialog.style.left)
    const styleTop = parseFloat(dialog.style.top)
    expect(styleLeft).toBeGreaterThanOrEqual(8)
    expect(styleTop).toBeGreaterThanOrEqual(8)
  })

  // 17. Center trigger renders correctly, only group + close buttons visible
  it('triggerX/triggerY at center renders 6 buttons initially', () => {
    renderPicker({ triggerX: window.innerWidth / 2, triggerY: window.innerHeight / 2 })
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  // 18. Canvas coordinates offset by half shape dimensions
  it('onDrawShape receives canvas coordinates offset by half the shape dimensions', () => {
    const onDrawShape = vi.fn()
    const canvasX = 300
    const canvasY = 200
    renderPicker({ canvasX, canvasY, onDrawShape })
    openGroup('Shapes')
    fireEvent.click(screen.getByRole('button', { name: /Place Rectangle/i }))
    expect(onDrawShape).toHaveBeenCalledWith('rectangle', canvasX - 100, canvasY - 70, 200, 140, undefined)
  })

  // 19. Table shape uses correct dimensions
  it('clicking Table calls onDrawShape with table type and correct dimensions', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    openGroup('Utility')
    fireEvent.click(screen.getByRole('button', { name: /Place Table/i }))
    expect(onDrawShape).toHaveBeenCalledWith(
      'table',
      expect.any(Number),
      expect.any(Number),
      360,
      128,
      undefined,
    )
  })

  // 20. Frame shape uses correct dimensions
  it('clicking Frame calls onDrawShape with frame type and correct dimensions', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    openGroup('Utility')
    fireEvent.click(screen.getByRole('button', { name: /Place Frame/i }))
    expect(onDrawShape).toHaveBeenCalledWith(
      'frame',
      expect.any(Number),
      expect.any(Number),
      400,
      300,
      undefined,
    )
  })

  // 21. Clicking a different group replaces the shape buttons
  it('clicking a different group replaces previously shown shapes', () => {
    renderPicker()
    openGroup('Utility')
    expect(screen.getByRole('button', { name: /Place Note/i })).toBeDefined()
    openGroup('Lines')
    expect(screen.queryByRole('button', { name: /Place Note/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Place Line/i })).toBeDefined()
  })

  // 22. Shape presets with overrides pass them to onDrawShape
  it('shape with overrides passes them to onDrawShape', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    openGroup('Utility')
    fireEvent.click(screen.getByRole('button', { name: /Place Text/i }))
    expect(onDrawShape).toHaveBeenCalledWith(
      'rectangle',
      expect.any(Number),
      expect.any(Number),
      200,
      140,
      expect.objectContaining({ color: 'transparent' }),
    )
  })

  // 23. Clicking same group again toggles it closed
  it('clicking an active group toggles it closed', () => {
    renderPicker()
    openGroup('Utility')
    expect(screen.getByRole('button', { name: /Place Note/i })).toBeDefined()
    openGroup('Utility')
    expect(screen.queryByRole('button', { name: /Place Note/i })).toBeNull()
  })

  // 24. Only one block arrow in Special group (others removed)
  it('Special group has exactly one block arrow', () => {
    renderPicker()
    openGroup('Special')
    const buttons = screen.getAllByRole('button')
    const arrowButtons = buttons.filter(b =>
      b.getAttribute('aria-label')?.includes('Arrow'),
    )
    expect(arrowButtons).toHaveLength(1)
    expect(arrowButtons[0].getAttribute('aria-label')).toBe('Place Arrow Right')
  })

  // 25. Close button calls onClose
  it('clicking the close button calls onClose', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /Close shape picker/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
