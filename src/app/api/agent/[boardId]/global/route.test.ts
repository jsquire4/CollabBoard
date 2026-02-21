/**
 * Tests for POST /api/agent/[boardId]/global
 * Now uses OpenAI Assistants API (threads + runs) instead of Chat Completions + board_messages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted constants + spies ─────────────────────────────────────────────────
const {
  TEST_BOARD_ID,
  mockThreadMessageCreate,
  mockRunStream,
  mockGetUser,
  mockMemberSingle,
  mockGetOrCreateThread,
  mockEnsureAssistant,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockThreadMessageCreate: vi.fn(),
  mockRunStream: vi.fn(),
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockGetOrCreateThread: vi.fn(),
  mockEnsureAssistant: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      beta: {
        threads: {
          messages: { create: mockThreadMessageCreate },
          runs: { stream: mockRunStream },
        },
        assistants: { create: vi.fn().mockResolvedValue({ id: 'asst_test' }) },
      },
    }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'board_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: mockMemberSingle,
        }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({}),
  }),
}))

vi.mock('@/lib/agent/boardState', () => ({
  loadBoardState: vi.fn().mockResolvedValue({
    boardId: TEST_BOARD_ID,
    objects: new Map(),
    fieldClocks: new Map(),
  }),
}))

vi.mock('@/lib/agent/tools', () => ({
  createTools: vi.fn().mockReturnValue({ definitions: [], executors: new Map() }),
  createToolContext: vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: vi.fn().mockReturnValue('Alice'),
}))

vi.mock('@/lib/agent/assistantsThread', () => ({
  getOrCreateThread: mockGetOrCreateThread,
  ensureAssistant: mockEnsureAssistant,
}))

vi.mock('@/lib/agent/sse', () => ({
  getOpenAI: vi.fn().mockReturnValue({
    beta: {
      threads: {
        messages: { create: mockThreadMessageCreate },
        runs: { stream: mockRunStream },
      },
      assistants: { create: vi.fn().mockResolvedValue({ id: 'asst_test' }) },
    },
  }),
  runAssistantsLoop: vi.fn().mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text-delta', text: 'Hello' })}\n\n`))
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        controller.close()
      },
    }),
  ),
  SSE_HEADERS: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
}))

// Import route AFTER mocks
import { POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-123', email: 'test@test.com', user_metadata: {} } },
    error: null,
  })
  mockMemberSingle.mockResolvedValue({
    data: { role: 'editor', can_use_agents: true },
    error: null,
  })
  mockGetOrCreateThread.mockResolvedValue('thread_test123')
  mockEnsureAssistant.mockResolvedValue('asst_test123')
  mockThreadMessageCreate.mockResolvedValue({ id: 'msg_test' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/agent/[boardId]/global', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Unauthorized' } })
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 403 when can_use_agents is false', async () => {
    mockMemberSingle.mockResolvedValueOnce({
      data: { role: 'editor', can_use_agents: false },
      error: null,
    })
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 403 when role is viewer', async () => {
    mockMemberSingle.mockResolvedValueOnce({
      data: { role: 'viewer', can_use_agents: true },
      error: null,
    })
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/message/i) })
  })

  it('returns 200 with text/event-stream for valid request', async () => {
    const res = await POST(makeRequest({ message: 'What is on the board?' }), makeParams())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('adds prefixed user message to the OpenAI thread', async () => {
    await POST(makeRequest({ message: 'Hello board' }), makeParams())

    expect(mockThreadMessageCreate).toHaveBeenCalledWith(
      'thread_test123',
      expect.objectContaining({
        role: 'user',
        content: expect.stringMatching(/^\[Alice \(editor\)\]: Hello board$/),
      }),
    )
  })

  it('returns 400 for non-UUID boardId', async () => {
    const res = await POST(makeRequest({ message: 'Hi' }), { params: Promise.resolve({ boardId: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/invalid board/i) })
  })

  it('returns 500 when OPENAI_API_KEY is not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/OPENAI_API_KEY/i) })
  })

  it('sanitizes display name special chars in prefix', async () => {
    const { getUserDisplayName } = await import('@/lib/userUtils')
    vi.mocked(getUserDisplayName).mockReturnValueOnce('Alice [Admin]')
    await POST(makeRequest({ message: 'Hi' }), makeParams())

    expect(mockThreadMessageCreate).toHaveBeenCalledWith(
      'thread_test123',
      expect.objectContaining({
        content: expect.stringContaining('Alice Admin'),
      }),
    )
    // Brackets should be stripped
    const content = mockThreadMessageCreate.mock.calls[0][1].content as string
    expect(content).not.toMatch(/\[Admin\]/)
  })

  it('calls getOrCreateThread with boardId', async () => {
    await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(mockGetOrCreateThread).toHaveBeenCalledWith(expect.anything(), TEST_BOARD_ID)
  })

  it('calls ensureAssistant with tools and system prompt', async () => {
    await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(mockEnsureAssistant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.stringContaining('global board assistant'),
    )
  })
})
