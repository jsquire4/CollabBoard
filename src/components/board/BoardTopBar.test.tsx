/**
 * Tests for BoardTopBar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardTopBar } from './BoardTopBar'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const { mockBoardUpdateResult } = vi.hoisted(() => ({
  mockBoardUpdateResult: { error: null as { message: string } | null },
}))
const mockSignOut = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: mockSignOut },
    from: () => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn(() => Promise.resolve(mockBoardUpdateResult)),
    }),
  }),
}))

vi.mock('./GridSettingsPopover', () => ({
  GridSettingsPopover: () => <div data-testid="grid-settings">Grid</div>,
}))

describe('BoardTopBar', () => {
  const defaultProps = {
    boardId: 'board-1',
    boardName: 'My Board',
    userRole: 'editor' as const,
    onShareClick: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders board name and Back button', () => {
    render(<BoardTopBar {...defaultProps} />)
    expect(screen.getByText('My Board')).toBeInTheDocument()
    expect(screen.getByTitle('Back to boards')).toBeInTheDocument()
  })

  it('navigates to /boards when Back clicked', async () => {
    render(<BoardTopBar {...defaultProps} />)
    await userEvent.click(screen.getByTitle('Back to boards'))
    expect(mockPush).toHaveBeenCalledWith('/boards')
  })

  it('shows Share button when canManage', async () => {
    render(<BoardTopBar {...defaultProps} userRole="owner" />)
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /share/i }))
    expect(defaultProps.onShareClick).toHaveBeenCalled()
  })

  it('shows View only for viewer role', () => {
    render(<BoardTopBar {...defaultProps} userRole="viewer" />)
    expect(screen.getByText('View only')).toBeInTheDocument()
  })

  it('shows Logout button', async () => {
    mockSignOut.mockResolvedValue(undefined)
    render(<BoardTopBar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('shows online users when provided', () => {
    const onlineUsers = [
      { user_id: 'u1', display_name: 'Alice', color: '#ff0000', role: 'editor' as const },
    ]
    render(<BoardTopBar {...defaultProps} onlineUsers={onlineUsers} />)
    expect(screen.getByTitle(/alice/i)).toBeInTheDocument()
  })

  it('shows snap-to-grid indicator', () => {
    render(<BoardTopBar {...defaultProps} snapToGrid={true} />)
    expect(screen.getByTitle('Snap to grid: ON')).toBeInTheDocument()
  })

  it('shows GridSettingsPopover when onUpdateBoardSettings provided', () => {
    render(<BoardTopBar {...defaultProps} onUpdateBoardSettings={vi.fn()} />)
    expect(screen.getByTestId('grid-settings')).toBeInTheDocument()
  })

  it('owner can rename board: click name, type, blur saves', async () => {
    mockBoardUpdateResult.error = null
    render(<BoardTopBar {...defaultProps} userRole="owner" />)
    await userEvent.click(screen.getByText('My Board'))
    const input = screen.getByDisplayValue('My Board')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed Board')
    input.blur()
    await waitFor(() => {
      expect(screen.getByText('Renamed Board')).toBeInTheDocument()
    })
  })

  it('owner can rename board: Enter saves', async () => {
    mockBoardUpdateResult.error = null
    render(<BoardTopBar {...defaultProps} userRole="owner" />)
    await userEvent.dblClick(screen.getByText('My Board'))
    const input = screen.getByDisplayValue('My Board')
    await userEvent.clear(input)
    await userEvent.type(input, 'New Name{Enter}')
    await waitFor(() => {
      expect(screen.getByText('New Name')).toBeInTheDocument()
    })
  })

  it('owner can cancel rename with Escape', async () => {
    render(<BoardTopBar {...defaultProps} userRole="owner" />)
    await userEvent.dblClick(screen.getByText('My Board'))
    const input = screen.getByDisplayValue('My Board')
    await userEvent.type(input, 'Changed')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('My Board')).toBeInTheDocument()
  })

  it('shows rename error when DB update fails', async () => {
    mockBoardUpdateResult.error = { message: 'db error' }
    render(<BoardTopBar {...defaultProps} userRole="owner" />)
    await userEvent.dblClick(screen.getByText('My Board'))
    const input = screen.getByDisplayValue('My Board')
    await userEvent.clear(input)
    await userEvent.type(input, 'New Name{Enter}')
    await waitFor(() => {
      expect(screen.getByText('Failed to rename board')).toBeInTheDocument()
    })
  })
})
