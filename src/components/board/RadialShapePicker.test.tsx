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

  // 2. Renders 8 shape buttons
  it('renders 8 shape buttons', () => {
    renderPicker()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(8)
  })

  // 3. Each button has aria-label starting with "Place"
  it('each button has an aria-label starting with "Place"', () => {
    renderPicker()
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn.getAttribute('aria-label')).toMatch(/^Place /)
    }
  })

  // 4. Clicking Sticky Note calls onDrawShape with sticky_note type
  it('clicking Sticky Note calls onDrawShape with sticky_note type', () => {
    const onDrawShape = vi.fn()
    const onClose = vi.fn()
    renderPicker({ onDrawShape, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Place Sticky Note/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onDrawShape).toHaveBeenCalledWith(
      'sticky_note',
      expect.any(Number),
      expect.any(Number),
      150,
      150,
    )
  })

  // 5. Clicking Rectangle calls onDrawShape with rectangle type
  it('clicking Rectangle calls onDrawShape with rectangle type', () => {
    const onDrawShape = vi.fn()
    const onClose = vi.fn()
    renderPicker({ onDrawShape, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Place Rectangle/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onDrawShape).toHaveBeenCalledWith(
      'rectangle',
      expect.any(Number),
      expect.any(Number),
      200,
      140,
    )
  })

  // 6. Clicking any shape calls onClose after onDrawShape
  it('clicking a shape calls onClose after onDrawShape', () => {
    const onDrawShape = vi.fn()
    const onClose = vi.fn()
    renderPicker({ onDrawShape, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Place Circle/i }))
    expect(onDrawShape).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    // onDrawShape should be called before onClose
    const drawOrder = onDrawShape.mock.invocationCallOrder[0]
    const closeOrder = onClose.mock.invocationCallOrder[0]
    expect(drawOrder).toBeLessThan(closeOrder)
  })

  // 7. Pressing Escape calls onClose
  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn()
    const onDrawShape = vi.fn()
    renderPicker({ onClose, onDrawShape })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 8. Clicking outside calls onClose
  it('mousedown outside the picker calls onClose', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 9. onClose called even if onDrawShape throws
  it('calls onClose even if onDrawShape throws', () => {
    const onClose = vi.fn()
    const onDrawShape = vi.fn(() => {
      throw new Error('draw failed')
    })
    renderPicker({ onDrawShape, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Place Sticky Note/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // 10. Dialog role is present
  it('has a dialog role', () => {
    renderPicker()
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  // 11. Dialog has correct aria-label
  it('dialog has aria-label "Shape picker"', () => {
    renderPicker()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Shape picker')
  })

  // 12. Positions within viewport when trigger is near an edge
  it('clamps left/top to stay within viewport when near right-bottom edge', () => {
    // Position the trigger near the bottom-right corner
    renderPicker({ triggerX: window.innerWidth - 10, triggerY: window.innerHeight - 10 })
    const dialog = screen.getByRole('dialog')
    const styleLeft = parseFloat(dialog.style.left)
    const styleTop = parseFloat(dialog.style.top)
    // The clamped values must stay within [8, window.innerWidth - 180 - 8] and [8, window.innerHeight - 180 - 8]
    expect(styleLeft).toBeGreaterThanOrEqual(8)
    expect(styleLeft).toBeLessThanOrEqual(window.innerWidth - 180 - 8)
    expect(styleTop).toBeGreaterThanOrEqual(8)
    expect(styleTop).toBeLessThanOrEqual(window.innerHeight - 180 - 8)
  })

  it('clamps left/top to stay within viewport when near left-top edge', () => {
    // Position the trigger at the very top-left
    renderPicker({ triggerX: 0, triggerY: 0 })
    const dialog = screen.getByRole('dialog')
    const styleLeft = parseFloat(dialog.style.left)
    const styleTop = parseFloat(dialog.style.top)
    expect(styleLeft).toBeGreaterThanOrEqual(8)
    expect(styleTop).toBeGreaterThanOrEqual(8)
  })

  // 13. Center trigger renders correctly, all items visible
  it('triggerX/triggerY at center renders correctly with all items visible', () => {
    renderPicker({ triggerX: window.innerWidth / 2, triggerY: window.innerHeight / 2 })
    // No errors during render, all 8 buttons are present
    expect(screen.getAllByRole('button')).toHaveLength(8)
    // Dialog should be visible
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  // Bonus: onDrawShape receives correct canvas-space coordinates (centered on canvasX/Y)
  it('onDrawShape receives canvas coordinates offset by half the shape dimensions', () => {
    const onDrawShape = vi.fn()
    const canvasX = 300
    const canvasY = 200
    renderPicker({ canvasX, canvasY, onDrawShape })
    fireEvent.click(screen.getByRole('button', { name: /Place Rectangle/i }))
    // Rectangle is 200×140
    expect(onDrawShape).toHaveBeenCalledWith('rectangle', canvasX - 100, canvasY - 70, 200, 140)
  })

  // Bonus: Table shape uses correct dimensions
  it('clicking Table calls onDrawShape with table type and correct dimensions', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    fireEvent.click(screen.getByRole('button', { name: /Place Table/i }))
    expect(onDrawShape).toHaveBeenCalledWith(
      'table',
      expect.any(Number),
      expect.any(Number),
      360,
      128,
    )
  })

  // Bonus: Frame shape uses correct dimensions
  it('clicking Frame calls onDrawShape with frame type and correct dimensions', () => {
    const onDrawShape = vi.fn()
    renderPicker({ onDrawShape })
    fireEvent.click(screen.getByRole('button', { name: /Place Frame/i }))
    expect(onDrawShape).toHaveBeenCalledWith(
      'frame',
      expect.any(Number),
      expect.any(Number),
      400,
      300,
    )
  })
})
