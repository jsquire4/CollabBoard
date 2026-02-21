/**
 * Tests for ShareDialog — sharing UI: tabs, members, invite form, link, ownership transfer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const {
  mockRpc,
  mockFrom,
  mockAuthGetUser,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockAuthGetUser: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const mockClipboardWrite = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWrite },
  writable: true,
  configurable: true,
})

import { ShareDialog } from './ShareDialog'

const BOARD_ID = '11111111-1111-1111-1111-111111111111'

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockClipboardWrite.mockResolvedValue(undefined)

    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_member_details') {
        return Promise.resolve({
          data: [
            { id: 'm1', user_id: 'u1', role: 'owner', email: 'owner@test.com', display_name: 'Owner', can_use_agents: true },
            { id: 'm2', user_id: 'u2', role: 'editor', email: 'editor@test.com', display_name: 'Editor', can_use_agents: true },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_invites') {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
        }
      }
      if (table === 'board_share_links') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      return {}
    })
  })

  it('renders Share Board title and close button', async () => {
    const onClose = vi.fn()
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Share Board')).toBeInTheDocument()
    })

    const closeButtons = screen.getAllByRole('button', { name: /×/ })
    await userEvent.click(closeButtons[0]) // header close button
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Members, Invite, Link tabs', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    })
  })

  it('switches to Invite tab and shows invite form', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeInTheDocument()
  })

  it('switches to Link tab and shows generate link UI', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
  })

  it('displays members when loaded', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/owner@test.com/)).toBeInTheDocument()
      expect(screen.getByText(/editor@test.com/)).toBeInTheDocument()
    })
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    const backdrop = container.querySelector('.fixed.inset-0')
    expect(backdrop).toBeInTheDocument()
    await userEvent.click(backdrop as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Owner (you) for owner when viewing as owner', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Owner (you)')).toBeInTheDocument()
    })
  })
})
