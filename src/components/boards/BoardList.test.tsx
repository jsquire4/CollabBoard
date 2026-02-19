/**
 * Tests for BoardList.handleDuplicateBoard:
 * 1) deleted_at IS NULL filter applied when fetching source objects
 * 2) Large object arrays chunked into batches of 300
 *
 * These tests render the full component and trigger duplication via the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Browser API mocks ────────────────────────────────────────────────

// IntersectionObserver is not available in jsdom
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
})

// ── Supabase mock ───────────────────────────────────────────────────

let mockFromImpl: (table: string) => Record<string, unknown>

const mockSupabase = {
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })),
  },
  from: vi.fn((...args: unknown[]) => mockFromImpl(args[0] as string)),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkModeValue: () => false,
}))

vi.mock('@/hooks/useBoardPresenceCount', () => ({
  useBoardPresenceCount: () => ({ count: 0, onlineUsers: [] }),
}))

import { BoardList } from './BoardList'

// ── Helpers ─────────────────────────────────────────────────────────

function makeBoard(overrides?: Record<string, unknown>) {
  return {
    id: 'b1', name: 'Board 1', role: 'owner' as const,
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('BoardList handleDuplicateBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no objects
    mockFromImpl = () => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', name: 'Board 1 - Copy' }, error: null })),
        })),
      })),
    })
  })

  it('filters deleted_at IS NULL when fetching source objects', async () => {
    const isCalls: [string, unknown][] = []

    mockFromImpl = (table: string) => {
      if (table === 'boards') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', name: 'Board 1 - Copy' }, error: null })),
            })),
          })),
        }
      }
      // board_objects
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn((col: string, val: unknown) => {
              isCalls.push([col, val])
              return Promise.resolve({ data: [], error: null })
            }),
          })),
        })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
    }

    render(<BoardList initialMyBoards={[makeBoard()]} initialSharedBoards={[]} />)

    // Find duplicate button by title
    const dupButton = screen.getByTitle('Duplicate board')
    await userEvent.click(dupButton)

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    expect(isCalls).toContainEqual(['deleted_at', null])
  })

  it('chunks large object arrays into batches of 300', async () => {
    // Generate 650 source objects
    const sourceObjects = Array.from({ length: 650 }, (_, i) => ({
      id: `obj-${i}`,
      board_id: 'b1',
      type: 'rectangle',
      x: i, y: i, width: 100, height: 100,
      rotation: 0, text: '', color: '#000', font_size: 14,
      z_index: i, parent_id: null,
      created_by: 'u1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      deleted_at: null,
    }))

    const insertBatches: unknown[][] = []

    mockFromImpl = (table: string) => {
      if (table === 'boards') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', name: 'Board 1 - Copy' }, error: null })),
            })),
          })),
        }
      }
      // board_objects
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({ data: sourceObjects, error: null })),
          })),
        })),
        insert: vi.fn((rows: unknown[]) => {
          insertBatches.push(rows)
          return Promise.resolve({ error: null })
        }),
      }
    }

    render(<BoardList initialMyBoards={[makeBoard()]} initialSharedBoards={[]} />)

    const dupButton = screen.getByTitle('Duplicate board')
    await userEvent.click(dupButton)

    await act(async () => { await new Promise(r => setTimeout(r, 100)) })

    // 650 objects: 300 + 300 + 50 = 3 batches
    expect(insertBatches.length).toBe(3)
    expect((insertBatches[0] as unknown[]).length).toBe(300)
    expect((insertBatches[1] as unknown[]).length).toBe(300)
    expect((insertBatches[2] as unknown[]).length).toBe(50)
  })
})
