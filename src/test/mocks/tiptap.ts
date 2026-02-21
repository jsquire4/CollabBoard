import { vi } from 'vitest'

export function createMockEditor() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const editor = {
    getJSON: vi.fn(() => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'mock text' }] }],
    })),
    getText: vi.fn(() => 'mock text'),
    getHTML: vi.fn(() => '<p>mock text</p>'),
    commands: {
      setContent: vi.fn(),
      focus: vi.fn(),
      toggleBold: vi.fn(),
      toggleItalic: vi.fn(),
      toggleUnderline: vi.fn(),
      toggleStrike: vi.fn(),
      toggleHighlight: vi.fn(),
      setColor: vi.fn(),
      setTextAlign: vi.fn(),
      toggleBulletList: vi.fn(),
      toggleOrderedList: vi.fn(),
      toggleTaskList: vi.fn(),
      toggleHeading: vi.fn(),
    },
    chain: vi.fn(() => {
      const chainable: Record<string, unknown> = {}
      const proxy = new Proxy(chainable, {
        get: (_target, prop) => {
          if (prop === 'run') return vi.fn()
          return () => proxy
        },
      })
      return proxy
    }),
    isActive: vi.fn(() => false),
    isDestroyed: false,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(cb)
      return editor
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(cb)
      return editor
    }),
    destroy: vi.fn(() => {
      editor.isDestroyed = true
    }),
    view: {
      dom: document.createElement('div'),
    },
    // Helpers for tests
    _emit: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach(cb => cb(...args))
    },
  }

  return editor
}
