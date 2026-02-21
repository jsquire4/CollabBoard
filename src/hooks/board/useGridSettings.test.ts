import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGridSettings } from './useGridSettings'

const mockFrom = vi.fn(() => ({
  update: vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  })),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      expect(table).toBe('boards')
      return mockFrom()
    },
  }),
}))

vi.mock('@/lib/retryWithRollback', () => ({
  fireAndRetry: vi.fn((opts: { operation: () => PromiseLike<{ error: unknown }> }) => opts.operation()),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const defaultParams = {
  boardId: 'board-123',
  initialGridSize: 40,
  initialGridSubdivisions: 1,
  initialGridVisible: true,
  initialSnapToGrid: false,
  initialGridStyle: 'lines' as const,
  initialCanvasColor: '#e8ecf1',
  initialGridColor: '#b4becd',
  initialSubdivisionColor: '#b4becd',
}

describe('useGridSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state from params', () => {
    const { result } = renderHook(() => useGridSettings(defaultParams))

    expect(result.current.gridSize).toBe(40)
    expect(result.current.gridSubdivisions).toBe(1)
    expect(result.current.gridVisible).toBe(true)
    expect(result.current.snapToGrid).toBe(false)
    expect(result.current.gridStyle).toBe('lines')
    expect(result.current.canvasColor).toBe('#e8ecf1')
    expect(result.current.gridColor).toBe('#b4becd')
    expect(result.current.subdivisionColor).toBe('#b4becd')
  })

  it('updateBoardSettings dispatches state updates', async () => {
    const { result } = renderHook(() => useGridSettings(defaultParams))

    await act(async () => {
      result.current.updateBoardSettings({
        grid_size: 20,
        grid_visible: false,
        snap_to_grid: true,
      })
    })

    expect(result.current.gridSize).toBe(20)
    expect(result.current.gridVisible).toBe(false)
    expect(result.current.snapToGrid).toBe(true)
    expect(result.current.gridSubdivisions).toBe(1)
  })

  it('updateBoardSettings persists to DB via fireAndRetry', async () => {
    const { fireAndRetry } = await import('@/lib/retryWithRollback')
    const { result } = renderHook(() => useGridSettings(defaultParams))

    await act(async () => {
      result.current.updateBoardSettings({
        grid_size: 60,
        canvas_color: '#ffffff',
      })
    })

    expect(fireAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        logError: expect.any(Function),
        onError: expect.any(Function),
      })
    )
    const call = (fireAndRetry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call).toBeDefined()
    const opResult = await call.operation()
    expect(opResult.error).toBeNull()
  })

  it('preserves unchanged fields when updating partial', async () => {
    const { result } = renderHook(() => useGridSettings(defaultParams))

    await act(async () => {
      result.current.updateBoardSettings({ grid_size: 80 })
    })

    expect(result.current.gridSize).toBe(80)
    expect(result.current.gridSubdivisions).toBe(1)
    expect(result.current.gridVisible).toBe(true)
    expect(result.current.gridStyle).toBe('lines')
  })

  it('updateBoardSettings uses correct boardId in DB call', async () => {
    const eqFn = vi.fn(() => Promise.resolve({ error: null }))
    const updateFn = vi.fn(() => ({ eq: eqFn }))
    mockFrom.mockReturnValue({ update: updateFn })

    const { result } = renderHook(() =>
      useGridSettings({ ...defaultParams, boardId: 'my-board-456' })
    )

    await act(async () => {
      result.current.updateBoardSettings({ grid_size: 30 })
    })

    expect(updateFn).toHaveBeenCalledWith({ grid_size: 30 })
    expect(eqFn).toHaveBeenCalledWith('id', 'my-board-456')
  })
})
