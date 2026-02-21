// src/test/viewportHelpers.ts
/**
 * Mock window.innerWidth and window.innerHeight for tests.
 * Call in beforeEach; the properties are restored automatically between test files
 * because jsdom resets them.
 */
export function mockViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: h })
}
