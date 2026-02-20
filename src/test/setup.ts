import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock navigator.clipboard for ShareDialog and similar tests
// configurable:true allows user-event to override it in tests that need the full clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn(() => Promise.resolve()) },
  writable: true,
  configurable: true,
})

// jsdom doesn't implement window.matchMedia — provide a minimal stub
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
