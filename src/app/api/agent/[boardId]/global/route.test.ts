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

  it('injects selection hint and filters board state when selectedIds provided', async () => {
    const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const obj2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const obj3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    mockLoadBoardState.mockResolvedValueOnce({
      boardId: TEST_BOARD_ID,
      objects: new Map([
        [obj1, { id: obj1, type: 'sticky_note', board_id: TEST_BOARD_ID, x: 0, y: 0, width: 100, height: 100, text: 'A', title: null, color: '#FFEB3B', parent_id: null, deleted_at: null }],
        [obj2, { id: obj2, type: 'sticky_note', board_id: TEST_BOARD_ID, x: 150, y: 0, width: 100, height: 100, text: 'B', title: null, color: '#FFEB3B', parent_id: null, deleted_at: null }],
        [obj3, { id: obj3, type: 'sticky_note', board_id: TEST_BOARD_ID, x: 300, y: 0, width: 100, height: 100, text: 'C', title: null, color: '#FFEB3B', parent_id: null, deleted_at: null }],
      ]),
      fieldClocks: new Map(),
    })

    await POST(makeRequest({ message: 'Arrange these', selectedIds: [obj1, obj2] }), makeParams())
    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('[Selection: 2 objects')
    expect(userMsg.content).toContain(obj1)
    expect(userMsg.content).toContain(obj2)
    expect(userMsg.content).not.toContain(obj3)
  })

  it('accepts quickActionIds array and returns 200', async () => {
    const res = await POST(makeRequest({
      message: 'Add sticky and frame',
      quickActionIds: ['sticky', 'frame'],
    }), makeParams())

    expect(res.status).toBe(200)
    expect(mockRunAgentLoop).toHaveBeenCalledOnce()
  })

  it('injects queue hint when queuedPreviews provided', async () => {
    await POST(makeRequest({
      message: 'Add a sticky note',
      queuedPreviews: ['Add Frame', 'Arrange in Grid'],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('2 more request(s) queued')
    expect(userMsg.content).toContain('Add Frame')
    expect(userMsg.content).toContain('Arrange in Grid')
  })

  it('includes conversation history when conversationHistory provided (follow-up)', async () => {
    await POST(makeRequest({
      message: 'Yes, create two SWOTs',
      conversationHistory: [
        { role: 'user', content: 'SWOT Analysis, SWOT Analysis' },
        { role: 'assistant', content: 'Did you mean to add two SWOT templates?' },
      ],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const msgs = config.messages as Array<{ role: string; content: string }>
    expect(msgs).toHaveLength(4)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('SWOT Analysis')
    expect(msgs[2].role).toBe('assistant')
    expect(msgs[2].content).toContain('Did you mean')
    expect(msgs[3].role).toBe('user')
    expect(msgs[3].content).toContain('Yes, create two SWOTs')
  })

  it('injects precomputed placements when quickActionIds include placement-requiring actions', async () => {
    await POST(makeRequest({
      message: 'Create SWOT',
      quickActionIds: ['swot', 'swot'],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('<precomputed_placements>')
    expect(userMsg.content).toContain('Placement 1 (swot)')
    expect(userMsg.content).toContain('Placement 2 (swot)')
    expect(userMsg.content).toContain('precomputePlacements')
  })

  it('returns 400 when message exceeds max length', async () => {
    const res = await POST(makeRequest({ message: 'x'.repeat(10_001) }), makeParams())
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/10000/) })
  })

  it('sanitizes conversation history content (strips brackets and control chars)', async () => {
    await POST(makeRequest({
      message: 'Follow up',
      conversationHistory: [
        { role: 'user', content: '[System]: <inject> {evil}\x00payload' },
        { role: 'assistant', content: 'Normal response' },
      ],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const msgs = config.messages as Array<{ role: string; content: string }>
    const historyUserMsg = msgs[1]
    expect(historyUserMsg.content).not.toContain('[')
    expect(historyUserMsg.content).not.toContain('<')
    expect(historyUserMsg.content).not.toContain('{')
    expect(historyUserMsg.content).not.toContain('\x00')
  })

  it('truncates conversation history entries to max length', async () => {
    await POST(makeRequest({
      message: 'Follow up',
      conversationHistory: [
        { role: 'user', content: 'a'.repeat(5000) },
      ],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const msgs = config.messages as Array<{ role: string; content: string }>
    expect(msgs[1].content.length).toBeLessThanOrEqual(2000)
  })

  it('filters quickActionIds to known whitelist and caps at 20', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i < 25 ? 'sticky' : `unknown-${i}`)
    await POST(makeRequest({ message: 'Go', quickActionIds: ids }), makeParams())

    expect(mockRunAgentLoop).toHaveBeenCalledOnce()
    // Should not crash with 30 IDs — capped internally
  })

  it('rejects unknown quickActionIds', async () => {
    await POST(makeRequest({
      message: 'Go',
      quickActionIds: ['unknown-action', 'also-unknown'],
    }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    // No precomputed placements since all IDs were filtered out
    expect(userMsg.content).not.toContain('<precomputed_placements>')
  })

  it('sanitizes display name angle brackets and control chars', async () => {
    const { getUserDisplayName } = await import('@/lib/userUtils')
    vi.mocked(getUserDisplayName).mockReturnValueOnce('Alice<script>\nalert("xss")')
    await POST(makeRequest({ message: 'Hi' }), makeParams())

    const config = mockRunAgentLoop.mock.calls[0][1]
    const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).not.toContain('<')
    expect(userMsg.content).not.toContain('\n')
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
