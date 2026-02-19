import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchBoardsGrouped, fetchBoardRole } from './boardsApi'

let mockAuthGetUser: ReturnType<typeof vi.fn>
let mockFrom: ReturnType<typeof vi.fn>
let mockRpc: ReturnType<typeof vi.fn>

vi.mock('./server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      get auth() {
        return { getUser: mockAuthGetUser }
      },
      get from() {
        return mockFrom
      },
      get rpc() {
        return mockRpc
      },
    })
  ),
}))

function chain(resolveValue: { data?: unknown; error?: { message: string } | null }) {
  const c = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    order: vi.fn(() => Promise.resolve(resolveValue)),
    single: vi.fn(() => Promise.resolve(resolveValue)),
    upsert: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => c),
  }
  return c
}

beforeEach(() => {
  mockAuthGetUser = vi.fn()
  mockFrom = vi.fn()
  mockRpc = vi.fn()
})

describe('boardsApi', () => {
  describe('fetchBoardsGrouped', () => {
    it('returns empty arrays when no user', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null } })

      const result = await fetchBoardsGrouped()

      expect(result).toEqual({ myBoards: [], sharedWithMe: [] })
    })

    it('returns empty arrays on fetch error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'u@test.com' } },
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB error' } })),
              })),
            })),
          }
        }
        if (table === 'board_invites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          }
        }
        return chain({ data: null, error: null })
      })

      const result = await fetchBoardsGrouped()

      expect(result).toEqual({ myBoards: [], sharedWithMe: [] })
      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch boards:', 'DB error')
      consoleSpy.mockRestore()
    })

    it('splits boards by role and sorts by updated_at desc', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'u@test.com' } },
      })

      const boardData = [
        {
          role: 'owner',
          boards: {
            id: 'b1',
            name: 'My Board',
            created_by: 'u1',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-03T00:00:00Z',
          },
        },
        {
          role: 'editor',
          boards: {
            id: 'b2',
            name: 'Shared Board',
            created_by: 'u2',
            created_at: '2026-01-02T00:00:00Z',
            updated_at: '2026-01-04T00:00:00Z',
          },
        },
      ]

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: boardData, error: null })),
              })),
            })),
          }
        }
        if (table === 'board_invites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          }
        }
        return chain({ data: null, error: null })
      })

      mockRpc.mockResolvedValue([])

      const result = await fetchBoardsGrouped()

      expect(result.myBoards).toHaveLength(1)
      expect(result.myBoards[0]!.id).toBe('b1')
      expect(result.myBoards[0]!.role).toBe('owner')

      expect(result.sharedWithMe).toHaveLength(1)
      expect(result.sharedWithMe[0]!.id).toBe('b2')
      expect(result.sharedWithMe[0]!.role).toBe('editor')
    })

    it('fetches and attaches card summaries', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'u@test.com' } },
      })

      const boardData = [
        {
          role: 'owner',
          boards: {
            id: 'b1',
            name: 'Board 1',
            created_by: 'u1',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      ]

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: boardData, error: null })),
              })),
            })),
          }
        }
        if (table === 'board_invites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          }
        }
        return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null })) })) }
      })

      const summary = { members: [{ user_id: 'u1', role: 'owner', display_name: 'User', is_anonymous: false }] }
      mockRpc.mockResolvedValue({ data: [{ board_id: 'b1', summary }], error: null })

      const result = await fetchBoardsGrouped()

      expect(mockRpc).toHaveBeenCalledWith('get_boards_card_summaries', { p_board_ids: ['b1'] })
      expect(result.myBoards[0]!.summary).toEqual(summary)
    })

    it('skips rows with null board', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'u@test.com' } },
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      { role: 'owner', boards: null },
                      {
                        role: 'owner',
                        boards: {
                          id: 'b1',
                          name: 'Valid',
                          created_by: 'u1',
                          created_at: '2026-01-01T00:00:00Z',
                          updated_at: '2026-01-01T00:00:00Z',
                        },
                      },
                    ],
                    error: null,
                  })
                ),
              })),
            })),
          }
        }
        if (table === 'board_invites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          }
        }
        return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null })) })) }
      })

      mockRpc.mockResolvedValue([])

      const result = await fetchBoardsGrouped()

      expect(result.myBoards).toHaveLength(1)
      expect(result.myBoards[0]!.id).toBe('b1')
    })

    it('accepts pending invites when user has invites', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'User@Test.com' } },
      })

      const invites = [
        {
          id: 'inv1',
          board_id: 'b2',
          email: 'user@test.com',
          role: 'editor',
          invited_by: 'u2',
        },
      ]

      const boardData = [
        {
          role: 'editor',
          boards: {
            id: 'b2',
            name: 'Invited Board',
            created_by: 'u2',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      ]

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                expect(col).toBe('email')
                expect(val).toBe('user@test.com') // normalized to lowercase
                return Promise.resolve({ data: invites, error: null })
              }),
            })),
            delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) })),
          }
        }
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: boardData, error: null })),
              })),
            })),
            upsert: vi.fn(() => Promise.resolve({})),
          }
        }
        return chain({ data: null, error: null })
      })

      mockRpc.mockResolvedValue([])

      const result = await fetchBoardsGrouped()

      expect(result.sharedWithMe).toHaveLength(1)
      expect(result.sharedWithMe[0]!.id).toBe('b2')
    })
  })

  describe('fetchBoardRole', () => {
    it('returns null when no user', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null } })

      const result = await fetchBoardRole('board-1')

      expect(result).toBeNull()
    })

    it('returns null when no membership', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1' } },
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          }
        }
        return chain({ data: null, error: null })
      })

      const result = await fetchBoardRole('board-1')

      expect(result).toBeNull()
    })

    it('returns role when membership exists', async () => {
      mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'u1' } },
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({ data: { role: 'editor' }, error: null })
                  ),
                })),
              })),
            })),
          }
        }
        return chain({ data: null, error: null })
      })

      const result = await fetchBoardRole('board-1')

      expect(result).toBe('editor')
    })
  })
})
