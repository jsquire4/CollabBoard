/**
 * Tests for useDarkMode — localStorage, system preference, toggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDarkMode, useDarkModeValue } from './useDarkMode'

const STORAGE_KEY = 'collabboard-ui-dark-mode'

describe('useDarkMode', () => {
  let mockMatchMedia: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockMatchMedia = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mockMatchMedia))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads from localStorage when stored value exists', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useDarkMode())
    expect(result.current[0]).toBe(true)
  })

  it('reads from localStorage when stored value is false', () => {
    localStorage.setItem(STORAGE_KEY, 'false')
    const { result } = renderHook(() => useDarkMode())
    expect(result.current[0]).toBe(false)
  })

  it('falls back to system preference when localStorage is empty', () => {
    mockMatchMedia.matches = true
    const { result } = renderHook(() => useDarkMode())
    expect(result.current[0]).toBe(true)
  })

  it('toggle updates dark mode and persists to localStorage', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(result.current[0]).toBe(false)

    act(() => {
      result.current[1](true)
    })
    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')

    act(() => {
      result.current[1](false)
    })
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('listens for storage events from other tabs', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(result.current[0]).toBe(false)

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'true' }))
    })
    expect(result.current[0]).toBe(true)
  })
})

describe('useDarkModeValue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  it('returns current dark mode value', () => {
    const { result } = renderHook(() => useDarkModeValue())
    expect(typeof result.current).toBe('boolean')
  })
})
