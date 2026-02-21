/**
 * Tests for useShareDialog — sharing logic: members, invites, links, role changes, ownership transfer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { BoardMember, BoardInvite, BoardShareLink } from '@/types/sharing'

const {
  mockRpc,
  mockFrom,
  mockAuthGetUser,
  mockToast,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockAuthGetUser: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: mockToast },
}))

// Clipboard mock (setup.ts has one; ensure writeText is mockable)
const mockClipboardWrite = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWrite },
  writable: true,
  configurable: true,
})

import { useShareDialog } from './useShareDialog'

const BOARD_ID = '11111111-1111-1111-1111-111111111111'

describe('useShareDialog', () => {
  afterEach(() => {

  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'current-user' } } })
    mockClipboardWrite.mockResolvedValue(undefined)

    // Default: loadData success
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_member_details') {
        return Promise.resolve({
          data: [{ id: 'm1', user_id: 'u1', role: 'owner', email: 'owner@test.com', display_name: 'Owner', can_use_agents: true }],
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

  it('loads members, invites, and share link on mount', async () => {
    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.members).toHaveLength(1)
    expect(result.current.members[0]).toMatchObject({ role: 'owner', email: 'owner@test.com' })
    expect(result.current.invites).toEqual([])
    expect(result.current.shareLink).toBeNull()
  })

  it('shows toast on load error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    renderHook(() => useShareDialog(BOARD_ID, 'owner'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Failed to load sharing data')
    })
  })

  it('handleInvite: no-op when email is empty', async () => {
    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(mockRpc).not.toHaveBeenCalledWith('lookup_user_by_email', expect.anything())
  })

  it('handleInvite: sets error for invalid email', async () => {
    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('not-an-email'))
    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toBe('Error: Please enter a valid email address')
  })

  it('handleInvite: shows "Added" status when API returns outcome=added', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ outcome: 'added' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('user@example.com'))
    act(() => result.current.setInviteRole('editor'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/invites', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ boardId: BOARD_ID, email: 'user@example.com', role: 'editor' }),
    }))
    expect(result.current.inviteStatus).toContain('Added')
    expect(result.current.inviteEmail).toBe('')
  })

  it('handleInvite: shows "Invited" status when API returns outcome=invited', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ outcome: 'invited', inviteId: 'inv-123' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('newuser@example.com'))
    act(() => result.current.setInviteRole('viewer'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toContain('Invited')
    expect(result.current.inviteEmail).toBe('')
  })

  it('handleInvite: shows validation error on 400 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid or missing email' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('valid@email.com'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toContain('Error')

  })

  it('handleInvite: shows permission error on 403 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('valid@email.com'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toContain('permission')

  })

  it('handleInvite: shows generic error on 500 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('valid@email.com'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toContain('Failed')

  })

  it('handleInvite: shows error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('valid@email.com'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(result.current.inviteStatus).toContain('Failed')

  })

  it('handleInvite: does not call fetch when email fails client-side regex', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setInviteEmail('not-an-email'))

    await act(async () => {
      await result.current.handleInvite()
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.inviteStatus).toBe('Error: Please enter a valid email address')

  })

  it('handleRoleChange: sets transferTarget when newRole is owner', async () => {
    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleRoleChange('m1', 'owner')
    })

    expect(result.current.transferTarget).toBe('m1')
  })

  it('handleRoleChange: updates role when newRole is not owner', async () => {
    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_members') {
        return {
          update: mockUpdate,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      if (table === 'board_invites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
    mockUpdate.mockReturnValue({ eq: vi.fn(() => ({ eq: mockEq })) })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleRoleChange('m1', 'editor')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'editor', can_use_agents: true })
    )
  })

  it('handleRoleChange: no-op when userRole is editor', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'm1', role: 'owner' }], error: null })
    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'editor'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleRoleChange('m1', 'manager')
    })

    expect(result.current.transferTarget).toBeNull()
    expect(mockFrom).not.toHaveBeenCalledWith('board_members')
  })

  it('handleAgentToggle: updates can_use_agents', async () => {
    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_members') {
        return {
          update: mockUpdate,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      if (table === 'board_invites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
    mockUpdate.mockReturnValue({ eq: vi.fn(() => ({ eq: mockEq })) })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'manager'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleAgentToggle('m1', false)
    })

    expect(mockUpdate).toHaveBeenCalledWith({ can_use_agents: false })
    expect(result.current.members[0].can_use_agents).toBe(false)
  })

  it('handleRemoveMember: deletes member', async () => {
    const mockDelete = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_members') {
        return {
          delete: mockDelete,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      if (table === 'board_invites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
    mockDelete.mockReturnValue({ eq: vi.fn(() => ({ eq: mockEq })) })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.members).toHaveLength(1)

    await act(async () => {
      await result.current.handleRemoveMember('m1')
    })

    expect(result.current.members).toHaveLength(0)
  })

  it('handleGenerateLink: inserts share link', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
        data: { id: 'link1', token: 'abc123', role: 'editor' },
        error: null,
      }) }),
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_share_links') {
        return {
          insert: mockInsert,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      if (table === 'board_invites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      return {}
    })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleGenerateLink()
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        board_id: BOARD_ID,
        role: 'editor',
        created_by: 'current-user',
      })
    )
    expect(result.current.shareLink).toMatchObject({ token: 'abc123' })
  })

  it('copyLink: writes to clipboard', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_member_details') return Promise.resolve({ data: [], error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'board_share_links') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({
            data: [{ id: 'l1', token: 'xyz789', role: 'viewer' }],
            error: null,
          })),
        }
      }
      if (table === 'board_invites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        }
      }
      return {}
    })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.shareLink).not.toBeNull()
    })

    await act(async () => {
      await result.current.copyLink()
    })

    expect(mockClipboardWrite).toHaveBeenCalledWith(
      expect.stringContaining('/board/join/xyz789')
    )
    expect(result.current.copied).toBe(true)
  })

  it('confirmTransferOwnership: calls RPC and clears transferTarget', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_member_details') return Promise.resolve({ data: [], error: null })
      if (name === 'transfer_board_ownership') return Promise.resolve({ error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const { result } = renderHook(() => useShareDialog(BOARD_ID, 'owner'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setTransferTarget('m1'))
    expect(result.current.transferTarget).toBe('m1')

    await act(async () => {
      await result.current.confirmTransferOwnership()
    })

    expect(mockRpc).toHaveBeenCalledWith('transfer_board_ownership', {
      p_board_id: BOARD_ID,
      p_new_owner_member_id: 'm1',
    })
    expect(result.current.transferTarget).toBeNull()
  })
})
