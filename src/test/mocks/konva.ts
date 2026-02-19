import { vi } from 'vitest'

export function createMockStage() {
  return {
    getPointerPosition: vi.fn(() => ({ x: 0, y: 0 })),
    getIntersection: vi.fn(() => null),
    container: vi.fn(() => document.createElement('div')),
    position: vi.fn(() => ({ x: 0, y: 0 })),
    scale: vi.fn(() => ({ x: 1, y: 1 })),
    batchDraw: vi.fn(),
    setPointersPositions: vi.fn(),
    find: vi.fn(() => []),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
  }
}

export function createMockNode(overrides?: Record<string, unknown>) {
  return {
    id: vi.fn(() => 'mock-node'),
    x: vi.fn(() => 0),
    y: vi.fn(() => 0),
    width: vi.fn(() => 100),
    height: vi.fn(() => 80),
    rotation: vi.fn(() => 0),
    scaleX: vi.fn(() => 1),
    scaleY: vi.fn(() => 1),
    getAbsolutePosition: vi.fn(() => ({ x: 0, y: 0 })),
    getParent: vi.fn(() => null),
    attrs: { id: 'mock-node' },
    ...overrides,
  }
}
