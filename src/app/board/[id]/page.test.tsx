/**
 * Tests for the board page route (src/app/board/[id]/page.tsx).
 * Verifies UUID guard rejects non-UUID paths before hitting the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BoardPage from './page'

const {
  mockNotFound,
  mockCreateClient,
  mockFetchBoardRole,
  mockGetUserDisplayName,
} = vi.hoisted(() => ({
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  mockCreateClient: vi.fn(),
  mockFetchBoardRole: vi.fn(),
  mockGetUserDisplayName: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/supabase/boardsApi', () => ({
  fetchBoardRole: mockFetchBoardRole,
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: mockGetUserDisplayName,
}))

vi.mock('@/components/board/BoardClient', () => ({
  BoardClient: () => null,
}))

describe('BoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls notFound for non-UUID board id before hitting DB', async () => {
    await expect(
      BoardPage({ params: Promise.resolve({ id: 'not-a-uuid' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockFetchBoardRole).not.toHaveBeenCalled()
  })

  it('calls notFound for empty id', async () => {
    await expect(
      BoardPage({ params: Promise.resolve({ id: '' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('calls notFound for id with invalid format', async () => {
    await expect(
      BoardPage({ params: Promise.resolve({ id: '123' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('proceeds past UUID check and calls createClient for valid UUID when user is null', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      from: vi.fn(),
    })

    await expect(
      BoardPage({ params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  it('renders BoardClient when board, user, and role exist', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'boards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'Test Board',
              grid_size: 40,
              grid_subdivisions: 1,
              grid_visible: true,
              snap_to_grid: false,
              grid_style: 'lines',
              canvas_color: '#FAF8F4',
              grid_color: '#E8E3DA',
              subdivision_color: '#E8E3DA',
            },
            error: null,
          }),
        }
      }
      return {}
    })

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-1',
              email: 'test@example.com',
              user_metadata: { full_name: 'Test User' },
            },
          },
        }),
      },
      from: mockFrom,
    })
    mockFetchBoardRole.mockResolvedValue('editor')
    mockGetUserDisplayName.mockReturnValue('Test User')

    const result = await BoardPage({
      params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
    })

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    expect(mockFetchBoardRole).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
    expect(mockGetUserDisplayName).toHaveBeenCalled()
    expect(result).toBeDefined()
  })
})
