/**
 * Tests for ShareDialog — sharing UI: tabs, members, invite form, link, ownership transfer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Share Board')).toBeInTheDocument()
    })

    const closeButton = screen.getByRole('button', { name: /close share dialog/i })
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Members, Invite, Link tabs', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    })
  })

  it('switches to Invite tab and shows invite form', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeInTheDocument()
  })

  it('switches to Link tab and shows generate link UI', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
  })

  it('displays members when loaded', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/owner@test.com/)).toBeInTheDocument()
      expect(screen.getByText(/editor@test.com/)).toBeInTheDocument()
    })
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    const backdrop = screen.getByRole('button', { name: 'Close dialog' })
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Owner (you) for owner when viewing as owner', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Owner (you)')).toBeInTheDocument()
    })
  })

  it('shows role dropdown for non-owner members', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/editor@test.com/)).toBeInTheDocument()
    })

    const roleSelects = screen.getAllByRole('combobox')
    expect(roleSelects.length).toBeGreaterThan(0)
  })

  it('shows transfer ownership modal when owner selects transfer', async () => {
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

    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())

    const roleSelects = screen.getAllByRole('combobox')
    const editorRoleSelect = roleSelects.find(s => (s as HTMLSelectElement).value === 'editor')
    expect(editorRoleSelect).toBeDefined()
    if (editorRoleSelect) await userEvent.selectOptions(editorRoleSelect, 'owner')

    await waitFor(() => {
      expect(screen.getByText('Transfer Ownership?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Transfer' })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByText('Transfer Ownership?')).not.toBeInTheDocument()
    })
  })

  it('shows Generate Link and link role selector when no share link', async () => {
    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
    expect(screen.getByText(/Generate a shareable link/)).toBeInTheDocument()
  })

  it('shows member without display_name uses user_id slice', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_member_details') {
        return Promise.resolve({
          data: [
            { id: 'm1', user_id: 'u1', role: 'owner', email: 'owner@test.com', display_name: 'Owner', can_use_agents: true },
            { id: 'm2', user_id: 'user-with-long-id-12345', role: 'editor', email: null, display_name: null, can_use_agents: true },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText(/user-wit\.\.\./)).toBeInTheDocument()
    })
  })

  it('copy link button copies to clipboard when share link exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_invites') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }
      }
      if (table === 'board_share_links') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({
            data: [{ id: 'l1', board_id: BOARD_ID, token: 'abc123', role: 'viewer', can_use_agents: false, created_by: 'u1', created_at: '2026-01-01', is_active: true }],
            error: null,
          })),
        }
      }
      return {}
    })

    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy Link' })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Copy Link' }))

    await waitFor(() => {
      expect(mockClipboardWrite).toHaveBeenCalledWith(expect.stringContaining('/board/join/abc123'))
    })
  })

  it('invite form shows error when invite fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid email' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<ShareDialog boardId={BOARD_ID} userRole="owner" channel={null} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Share Board')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))

    await userEvent.type(screen.getByPlaceholderText('Email address'), 'bad@email')
    await userEvent.click(screen.getByRole('button', { name: 'Send Invite' }))

    await waitFor(() => {
      expect(screen.getByText(/error|invalid/i)).toBeInTheDocument()
    })
  })
})
