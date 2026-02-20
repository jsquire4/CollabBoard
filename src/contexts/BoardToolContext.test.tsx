import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { BoardToolProvider, useBoardToolContext } from './BoardToolContext'
import type { ShapePreset } from '@/components/board/shapePresets'

const mockPreset: ShapePreset = {
  id: 'test-preset',
  label: 'Test Preset',
  dbType: 'rectangle',
  defaultWidth: 100,
  defaultHeight: 80,
  iconPath: 'M0 0h24v24H0z',
}

function makeToolValue(overrides?: Partial<{ activePreset: ShapePreset | null; setActiveTool: () => void; setActivePreset: () => void }>) {
  return {
    activePreset: null as ShapePreset | null,
    setActiveTool: vi.fn(),
    setActivePreset: vi.fn(),
    ...overrides,
  }
}

describe('BoardToolContext', () => {
  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useBoardToolContext())
    }).toThrow('useBoardToolContext must be used within a BoardToolProvider')
  })

  it('returns context value when inside provider', () => {
    const setActiveTool = vi.fn()
    const setActivePreset = vi.fn()
    const value = makeToolValue({ activePreset: mockPreset, setActiveTool, setActivePreset })

    const { result } = renderHook(() => useBoardToolContext(), {
      wrapper: ({ children }) => (
        <BoardToolProvider value={value}>{children}</BoardToolProvider>
      ),
    })

    expect(result.current.activePreset).toEqual(mockPreset)
    expect(result.current.setActiveTool).toBe(setActiveTool)
    expect(result.current.setActivePreset).toBe(setActivePreset)
  })

  it('setActivePreset callback propagates', () => {
    const setActivePreset = vi.fn()
    const value = makeToolValue({ setActivePreset })

    const { result } = renderHook(() => useBoardToolContext(), {
      wrapper: ({ children }) => (
        <BoardToolProvider value={value}>{children}</BoardToolProvider>
      ),
    })

    result.current.setActivePreset(mockPreset)
    expect(setActivePreset).toHaveBeenCalledWith(mockPreset)
  })
})
