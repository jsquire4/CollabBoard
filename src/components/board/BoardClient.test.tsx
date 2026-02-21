/**
 * Smoke test for BoardClient.
 * Mocks Supabase, Realtime, Canvas, and Next.js router to verify the component renders without crashing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { BoardClient } from './BoardClient'

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/board/board-1',
}))

const mockChannel = {
  on: vi.fn(() => mockChannel),
  subscribe: vi.fn((cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED')
    return mockChannel
  }),
  unsubscribe: vi.fn(),
  presenceState: vi.fn(() => ({})),
  untrack: vi.fn(),
}

function mockFromChain() {
  const chain: Record<string, unknown> = {}
  const terminal = Promise.resolve({ data: [], error: null })
  for (const m of ['select', 'eq', 'is', 'limit', 'in', 'update', 'delete', 'insert', 'single', 'upsert']) {
    chain[m] = vi.fn(() => (m === 'limit' || m === 'in' || m === 'single' || m === 'upsert' ? terminal : chain))
  }
  return chain
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => mockFromChain()),
    functions: { invoke: vi.fn().mockResolvedValue({ error: null }) },
  })),
}))

vi.mock('./Canvas', () => ({
  Canvas: () => <div data-testid="canvas-mock">Canvas</div>,
}))

vi.mock('next/dynamic', () => ({
  default: (_fn: () => Promise<{ default: React.ComponentType }>) => {
    const Comp = () => <div data-testid="canvas-mock">Canvas</div>
    return Comp
  },
}))

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BoardClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const defaultProps = {
    userId: 'user-1',
    boardId: 'board-1',
    boardName: 'Test Board',
    userRole: 'editor' as const,
    displayName: 'Test User',
  }

  it('renders without crashing', async () => {
    let container: HTMLElement | undefined
    await act(async () => {
      const result = render(<BoardClient {...defaultProps} />)
      container = result.container
    })
    expect(container).toBeDefined()
    expect(container).toBeInTheDocument()
  })

  it('renders canvas placeholder or canvas', async () => {
    await act(async () => {
      render(<BoardClient {...defaultProps} />)
    })
    // dynamic() shows loading first, then Canvas; either is valid
    const canvasOrLoading = document.querySelector('[data-testid="canvas-mock"]') ?? document.querySelector('.animate-spin')
    expect(canvasOrLoading).toBeTruthy()
  })
})
