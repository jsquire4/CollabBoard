import { vi } from 'vitest'

export function createMockChannel() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      if (cb) cb('SUBSCRIBED')
      return channel
    }),
    send: vi.fn(() => Promise.resolve('ok')),
    unsubscribe: vi.fn(),
    track: vi.fn(() => Promise.resolve('ok')),
  }
  return channel
}
