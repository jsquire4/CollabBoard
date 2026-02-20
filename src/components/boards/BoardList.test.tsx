/**
 * Tests for BoardList, BoardCard, and NewBoardCard components.
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

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/useBoardPresenceCount', () => ({
  useBoardPresenceCount: () => ({ count: 0, onlineUsers: [] }),
}))

import { BoardList } from './BoardList'
import { BoardCard } from './BoardCard'
import { NewBoardCard } from './NewBoardCard'

// ── Helpers ─────────────────────────────────────────────────────────

function makeBoard(overrides?: Record<string, unknown>) {
  return {
    id: 'b1', name: 'Board 1', role: 'owner' as const,
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const noop = () => {}

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

// ── NewBoardCard Tests ──────────────────────────────────────────────

describe('NewBoardCard', () => {
  it('renders "New Board" button when not creating', () => {
    render(
      <NewBoardCard isCreating={false} newName="" onNameChange={noop} onCreate={noop} onCancel={noop} onClick={noop} />
    )
    expect(screen.getByText('New Board')).toBeInTheDocument()
  })

  it('calls onClick when button is clicked', async () => {
    const onClick = vi.fn()
    render(
      <NewBoardCard isCreating={false} newName="" onNameChange={noop} onCreate={noop} onCancel={noop} onClick={onClick} />
    )
    await userEvent.click(screen.getByText('New Board'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders input and buttons when creating', () => {
    render(
      <NewBoardCard isCreating={true} newName="" onNameChange={noop} onCreate={noop} onCancel={noop} onClick={noop} />
    )
    expect(screen.getByPlaceholderText('Board name')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    // Button text is "Creating…" when isCreating is true
    expect(screen.getByText('Creating…')).toBeInTheDocument()
  })

  it('calls onCreate on Enter key in input', async () => {
    const onCreate = vi.fn()
    render(
      <NewBoardCard isCreating={true} newName="Test" onNameChange={noop} onCreate={onCreate} onCancel={noop} onClick={noop} />
    )
    const input = screen.getByPlaceholderText('Board name')
    await userEvent.type(input, '{Enter}')
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Escape key in input', async () => {
    const onCancel = vi.fn()
    render(
      <NewBoardCard isCreating={true} newName="Test" onNameChange={noop} onCreate={noop} onCancel={onCancel} onClick={noop} />
    )
    const input = screen.getByPlaceholderText('Board name')
    await userEvent.type(input, '{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(
      <NewBoardCard isCreating={true} newName="" onNameChange={noop} onCreate={noop} onCancel={onCancel} onClick={noop} />
    )
    await userEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

// ── BoardCard Tests ─────────────────────────────────────────────────

describe('BoardCard', () => {
  const defaultProps = {
    editingId: null,
    editName: '',
    onEditNameChange: noop,
    onRename: noop,
    onEditingCancel: noop,
    onDoubleClickTitle: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onLeave: vi.fn(),
    onNavigate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the spy fns in defaultProps
    defaultProps.onDoubleClickTitle = vi.fn()
    defaultProps.onDuplicate = vi.fn()
    defaultProps.onDelete = vi.fn()
    defaultProps.onLeave = vi.fn()
    defaultProps.onNavigate = vi.fn()
  })

  it('renders board name and role badge', () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'editor' })} />)
    expect(screen.getByText('Board 1')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  it('owner sees duplicate/delete buttons, not Leave', () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'owner' })} />)
    expect(screen.getByTitle('Duplicate board')).toBeInTheDocument()
    expect(screen.getByTitle('Delete board')).toBeInTheDocument()
    expect(screen.queryByText('Leave')).not.toBeInTheDocument()
  })

  it('non-owner sees Leave button, not duplicate/delete', () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'viewer' })} />)
    expect(screen.getByText('Leave')).toBeInTheDocument()
    expect(screen.queryByTitle('Duplicate board')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete board')).not.toBeInTheDocument()
  })

  it('click navigates to board', async () => {
    render(<BoardCard {...defaultProps} board={makeBoard()} />)
    // Click the card's outer div (has role="button") — use getByText on the board name
    await userEvent.click(screen.getByText('Board 1'))
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('b1')
  })

  it('double-click title triggers edit for owners', async () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'owner' })} />)
    const title = screen.getByText('Board 1')
    await userEvent.dblClick(title)
    expect(defaultProps.onDoubleClickTitle).toHaveBeenCalledOnce()
  })

  it('double-click title does nothing for non-owners', async () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'viewer' })} />)
    const title = screen.getByText('Board 1')
    await userEvent.dblClick(title)
    expect(defaultProps.onDoubleClickTitle).not.toHaveBeenCalled()
  })

  it('delete button calls onDelete without triggering navigation', async () => {
    render(<BoardCard {...defaultProps} board={makeBoard({ role: 'owner' })} />)
    await userEvent.click(screen.getByTitle('Delete board'))
    expect(defaultProps.onDelete).toHaveBeenCalledWith('b1')
    expect(defaultProps.onNavigate).not.toHaveBeenCalled()
  })
})

// ── BoardList Integration Tests ─────────────────────────────────────

describe('BoardList integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
    mockFromImpl = () => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', name: 'New Board' }, error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })
  })

  it('renders My Boards heading, NewBoardCard, and board cards', () => {
    render(
      <BoardList
        initialMyBoards={[makeBoard(), makeBoard({ id: 'b2', name: 'Board 2' })]}
        initialSharedBoards={[]}
      />
    )
    expect(screen.getByText('My Boards')).toBeInTheDocument()
    expect(screen.getByText('New Board')).toBeInTheDocument()
    expect(screen.getByText('Board 1')).toBeInTheDocument()
    expect(screen.getByText('Board 2')).toBeInTheDocument()
  })

  it('hides shared section when no shared boards', () => {
    render(<BoardList initialMyBoards={[makeBoard()]} initialSharedBoards={[]} />)
    expect(screen.queryByText('Boards Shared with Me')).not.toBeInTheDocument()
  })

  it('shows shared section when populated', () => {
    render(
      <BoardList
        initialMyBoards={[]}
        initialSharedBoards={[makeBoard({ id: 's1', name: 'Shared Board', role: 'editor' as const })]}
      />
    )
    expect(screen.getByText('Boards Shared with Me')).toBeInTheDocument()
    expect(screen.getByText('Shared Board')).toBeInTheDocument()
  })

  it('create flow: New Board → type name → Enter → navigates', async () => {
    render(<BoardList initialMyBoards={[]} initialSharedBoards={[]} />)

    await userEvent.click(screen.getByText('New Board'))
    const input = screen.getByPlaceholderText('Board name')
    await userEvent.type(input, 'My New Board')
    await userEvent.type(input, '{Enter}')

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    expect(mockSupabase.from).toHaveBeenCalledWith('boards')
    expect(mockPush).toHaveBeenCalledWith('/board/new-id')
  })

  it('delete flow: click delete → board removed from DOM', async () => {
    render(<BoardList initialMyBoards={[makeBoard()]} initialSharedBoards={[]} />)

    expect(screen.getByText('Board 1')).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Delete board'))

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    expect(screen.queryByText('Board 1')).not.toBeInTheDocument()
  })

  it('rename flow: double-click title → type new name → Enter → name updated', async () => {
    render(<BoardList initialMyBoards={[makeBoard()]} initialSharedBoards={[]} />)

    // Double-click the board title to enter rename mode
    const title = screen.getByText('Board 1')
    await userEvent.dblClick(title)

    // An input should appear with the current name
    const input = screen.getByDisplayValue('Board 1')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed Board')
    await userEvent.type(input, '{Enter}')

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Board name should be updated in the DOM
    expect(screen.getByText('Renamed Board')).toBeInTheDocument()
    expect(screen.queryByText('Board 1')).not.toBeInTheDocument()
  })

  it('leave flow: non-owner clicks Leave → board removed from shared list', async () => {
    const sharedBoard = makeBoard({ id: 's1', name: 'Shared Board', role: 'viewer' as const, created_by: 'other-user' })

    // Mock board_members delete chain
    mockFromImpl = (table: string) => {
      if (table === 'board_members') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          })),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 'new-id' }, error: null })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }
    }

    render(<BoardList initialMyBoards={[]} initialSharedBoards={[sharedBoard]} />)

    expect(screen.getByText('Shared Board')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Leave'))

    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    expect(screen.queryByText('Shared Board')).not.toBeInTheDocument()
    // Shared section should also disappear when empty
    expect(screen.queryByText('Boards Shared with Me')).not.toBeInTheDocument()
  })
})
