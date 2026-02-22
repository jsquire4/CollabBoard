/**
 * Tests for POST /api/agent/[boardId]/global
 * Uses Chat Completions (runAgentLoop) — stateless, board state injected per request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted constants + spies ─────────────────────────────────────────────────
const {
  TEST_BOARD_ID,
  mockRunAgentLoop,
  mockGetUser,
  mockMemberSingle,
  mockLoadBoardState,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockRunAgentLoop: vi.fn(),
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockLoadBoardState: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'board_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: mockMemberSingle,
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
  loadBoardState: mockLoadBoardState,
}))

vi.mock('@/lib/agent/tools', () => ({
  createTools: vi.fn().mockReturnValue({ definitions: [], executors: new Map() }),
  createToolContext: vi.fn().mockReturnValue({}),
  getToolDefinitions: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: vi.fn().mockReturnValue('Alice'),
}))

vi.mock('@/lib/agent/sse', () => ({
  getOpenAI: vi.fn().mockReturnValue({}),
  runAgentLoop: mockRunAgentLoop,
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

function makeSSEStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text-delta', text: 'Hello' })}\n\n`))
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
      controller.close()
    },
  })
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
  mockLoadBoardState.mockResolvedValue({
    boardId: TEST_BOARD_ID,
    objects: new Map(),
    fieldClocks: new Map(),
  })
  mockRunAgentLoop.mockReturnValue(makeSSEStream())
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

  it('calls runAgentLoop with prefixed user message and gpt-4o-mini model', async () => {
    await POST(makeRequest({ message: 'Hello board' }), makeParams())

    expect(mockRunAgentLoop).toHaveBeenCalledOnce()
    const config = mockRunAgentLoop.mock.calls[0][1]
    expect(config.model).toBe('gpt-4o-mini')
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toMatch(/^\[Alice \(editor\)\]: Hello board/)
  })

  it('uses parallelToolCalls: false', async () => {
    await POST(makeRequest({ message: 'Hi' }), makeParams())
    const config = mockRunAgentLoop.mock.calls[0][1]
    expect(config.parallelToolCalls).toBe(false)
  })

  it('omits board_state block when board is empty', async () => {
    await POST(makeRequest({ message: 'Hi' }), makeParams())
    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).not.toContain('<board_state>')
  })

  it('injects board_state into user message when board has objects', async () => {
    const stickyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    mockLoadBoardState.mockResolvedValueOnce({
      boardId: TEST_BOARD_ID,
      objects: new Map([[stickyId, {
        id: stickyId, type: 'sticky_note', board_id: TEST_BOARD_ID,
        x: 100, y: 200, width: 150, height: 150,
        text: 'Hello', title: null, color: '#FFEB3B',
        parent_id: null, deleted_at: null,
      }]]),
      fieldClocks: new Map(),
    })

    await POST(makeRequest({ message: 'What is on the board?' }), makeParams())
    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('<board_state>')
    expect(userMsg.content).toContain(stickyId)
    expect(userMsg.content).toContain('sticky_note')
  })

  it('sanitizes display name special chars in prefix', async () => {
    const { getUserDisplayName } = await import('@/lib/userUtils')
    vi.mocked(getUserDisplayName).mockReturnValueOnce('Alice [Admin]')
    await POST(makeRequest({ message: 'Hi' }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).not.toMatch(/\[Admin\]/)
    expect(userMsg.content).toContain('Alice Admin')
  })

  it('returns 503 when loadBoardState fails', async () => {
    mockLoadBoardState.mockRejectedValueOnce(new Error('DB error'))
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    expect(res.status).toBe(503)
  })

  it('adds truncation note when board state exceeds char limit', async () => {
    // Generate enough objects to exceed 50K chars
    const objects = new Map()
    for (let i = 0; i < 600; i++) {
      const id = `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`
      objects.set(id, {
        id, type: 'sticky_note', board_id: TEST_BOARD_ID,
        x: i * 10, y: 0, width: 150, height: 150,
        text: `Object number ${i} with some text content to bulk up the payload`,
        title: null, color: '#FFEB3B', parent_id: null, deleted_at: null,
      })
    }
    mockLoadBoardState.mockResolvedValueOnce({ boardId: TEST_BOARD_ID, objects, fieldClocks: new Map() })

    await POST(makeRequest({ message: 'Summarize the board' }), makeParams())
    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('truncated')
    expect(userMsg.content).toContain('<board_state')
  })
})
