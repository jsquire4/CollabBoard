/**
 * Tests for FilmstripPanel component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardObject } from '@/types/board'
import { FilmstripPanel, type FilmstripPanelProps } from './FilmstripPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFrame(overrides: Partial<BoardObject> = {}): BoardObject {
  return {
    id: 'frame-1',
    board_id: 'board-1',
    type: 'frame',
    x: 0, y: 0,
    width: 800, height: 600,
    rotation: 0,
    z_index: 1,
    is_slide: true,
    slide_index: 0,
    title: 'Slide 1',
    text: '',
    color: '#ffffff',
    font_size: 14,
    ...overrides,
  } as BoardObject
}

const noop = () => {}

function defaultProps(overrides: Partial<FilmstripPanelProps> = {}): FilmstripPanelProps {
  return {
    isOpen: true,
    onClose: noop,
    boardId: 'board-1',
    frames: [],
    currentFrameId: null,
    onSelectSlide: vi.fn(),
    onReorder: vi.fn(),
    onExport: vi.fn(),
    thumbnails: {},
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FilmstripPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Returns null when isOpen is false
  it('returns null when isOpen is false', () => {
    const { container } = render(<FilmstripPanel {...defaultProps({ isOpen: false })} />)
    expect(container.firstChild).toBeNull()
  })

  // 2. Renders "No slides yet." when no slide frames
  it('renders "No slides yet." when no slide frames', () => {
    render(<FilmstripPanel {...defaultProps({ frames: [] })} />)
    expect(screen.getByText(/no slides yet/i)).toBeInTheDocument()
  })

  // 3. Renders thumbnail for each slide frame
  it('renders thumbnail for each slide frame', () => {
    const frames = [
      makeFrame({ id: 'f1', title: 'Slide 1', slide_index: 0 }),
      makeFrame({ id: 'f2', title: 'Slide 2', slide_index: 1 }),
    ]

    render(<FilmstripPanel {...defaultProps({ frames })} />)

    expect(screen.getByText('Slide 1')).toBeInTheDocument()
    expect(screen.getByText('Slide 2')).toBeInTheDocument()
  })

  // 4. Clicking thumbnail calls onSelectSlide with frameId
  it('clicking thumbnail calls onSelectSlide with the frame ID', async () => {
    const onSelectSlide = vi.fn()
    const frame = makeFrame({ id: 'f1', title: 'Slide 1' })

    render(<FilmstripPanel {...defaultProps({ frames: [frame], onSelectSlide })} />)

    const slideEl = screen.getByText('Slide 1')
    await userEvent.click(slideEl)

    expect(onSelectSlide).toHaveBeenCalledWith('f1')
  })

  // 5. Export button calls onExport
  it('Export button calls onExport', async () => {
    const onExport = vi.fn()

    render(<FilmstripPanel {...defaultProps({ onExport })} />)

    const exportBtn = screen.getByRole('button', { name: /export/i })
    await userEvent.click(exportBtn)

    expect(onExport).toHaveBeenCalledOnce()
  })

  // 6. Current slide is highlighted with active class
  it('highlights the currently selected slide', () => {
    const frames = [
      makeFrame({ id: 'f1', title: 'Slide 1', slide_index: 0 }),
      makeFrame({ id: 'f2', title: 'Slide 2', slide_index: 1 }),
    ]

    render(<FilmstripPanel {...defaultProps({ frames, currentFrameId: 'f1' })} />)

    // Active slide container should have ring class
    const slide1Container = screen.getByTestId('slide-f1')
    expect(slide1Container.className).toMatch(/ring/)

    // Inactive slide should not have ring class
    const slide2Container = screen.getByTestId('slide-f2')
    expect(slide2Container.className).not.toMatch(/ring/)
  })

  // 7. Slide count displayed
  it('displays the correct slide count', () => {
    const frames = [
      makeFrame({ id: 'f1', slide_index: 0 }),
      makeFrame({ id: 'f2', slide_index: 1 }),
      makeFrame({ id: 'f3', slide_index: 2 }),
    ]

    render(<FilmstripPanel {...defaultProps({ frames })} />)

    // Numbers 1, 2, 3 should appear as slide indices
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // 8. Close button calls onClose
  it('close button calls onClose', async () => {
    const onClose = vi.fn()
    render(<FilmstripPanel {...defaultProps({ onClose })} />)

    const closeBtn = screen.getByRole('button', { name: /close/i })
    await userEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalledOnce()
  })
})
