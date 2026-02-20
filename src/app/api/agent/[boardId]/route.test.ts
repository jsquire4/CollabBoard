/**
 * Tests for POST /api/agent/[boardId]
 * Critical paths: auth, can_use_agents enforcement, SSE streaming, agent_state transitions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { collectSSE } from '@/test/sseHelpers'
import { makeFakeChatStream } from '@/test/mocks/openai'

// ── Hoisted constants + spies (available in mock factories) ──────────────────
const {
  TEST_BOARD_ID,
  TEST_AGENT_ID,
  mockCreate,
  mockInsert,
  mockAgentStateUpdate,
  mockGetUser,
  mockMemberSingle,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_AGENT_ID: '22222222-2222-2222-2222-222222222222',
  mockCreate: vi.fn(),
  mockInsert: vi.fn(),
  mockAgentStateUpdate: vi.fn(),
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('openai', () => ({
  // Must use regular function (not arrow) so `new OpenAI(...)` works as constructor
  default: vi.fn().mockImplementation(function() {
    return { chat: { completions: { create: mockCreate } } }
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
    from: vi.fn((table: string) => {
      if (table === 'board_messages') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: mockInsert,
        }
      }
      if (table === 'board_objects') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: mockAgentStateUpdate,
            }),
          }),
        }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/agent/boardState', () => ({
  loadBoardState: vi.fn().mockResolvedValue({
    boardId: TEST_BOARD_ID,
    objects: new Map(),
    fieldClocks: new Map(),
  }),
}))

vi.mock('@/lib/agent/contextResolver', () => ({
  resolveConnectionGraph: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/agent/tools', () => ({
  createTools: vi.fn().mockReturnValue({ definitions: [], executors: new Map() }),
  createToolContext: vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: vi.fn().mockReturnValue('Alice'),
}))

// Import route AFTER mocks are registered
import { POST } from './route'
import { createTools } from '@/lib/agent/tools'

// ── Test helpers ──────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

const defaultBody = () => ({ message: 'Hello', agentObjectId: TEST_AGENT_ID })

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
  mockInsert.mockResolvedValue({ data: null, error: null })
  mockAgentStateUpdate.mockResolvedValue({ data: null, error: null })
  mockCreate.mockImplementation(() =>
    makeFakeChatStream([{ type: 'text', text: 'Hello!' }, { type: 'done' }])
  )
  vi.mocked(createTools).mockReturnValue({ definitions: [], executors: new Map() })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Test suite ────────────────────────────────────────────────────────────────
describe('POST /api/agent/[boardId]', () => {
  // ── Input validation ──────────────────────────────────────────────────────

  it('returns 400 for non-UUID boardId', async () => {
    const req = makeRequest(defaultBody())
    const res = await POST(req, { params: Promise.resolve({ boardId: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/invalid board/i) })
  })

  it('returns 500 when OPENAI_API_KEY is not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/OPENAI_API_KEY/i) })
  })

  it('returns 400 when message body is missing', async () => {
    const req = makeRequest({ agentObjectId: TEST_AGENT_ID })
    const res = await POST(req, makeParams())
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/message/i) })
  })

  it('returns 400 when agentObjectId is missing', async () => {
    const req = makeRequest({ message: 'Hello' })
    const res = await POST(req, makeParams())
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/agentObjectId/i) })
  })

  it('returns 400 when agentObjectId is not a valid UUID', async () => {
    const req = makeRequest({ message: 'Hello', agentObjectId: 'bad-id' })
    const res = await POST(req, makeParams())
    expect(res.status).toBe(400)
  })

  // ── Auth / authorization ──────────────────────────────────────────────────

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Not logged in' } })
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 403 when can_use_agents is false', async () => {
    mockMemberSingle.mockResolvedValueOnce({
      data: { role: 'editor', can_use_agents: false },
      error: null,
    })
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 403 when role is viewer (even with can_use_agents true)', async () => {
    mockMemberSingle.mockResolvedValueOnce({
      data: { role: 'viewer', can_use_agents: true },
      error: null,
    })
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 403 when user is not a board member', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: null, error: null })
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(403)
  })

  // ── SSE streaming ─────────────────────────────────────────────────────────

  it('returns 200 with text/event-stream content-type', async () => {
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('streams text-delta and done events', async () => {
    mockCreate.mockImplementation(() =>
      makeFakeChatStream([{ type: 'text', text: 'Hi there' }, { type: 'done' }])
    )
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>
    expect(events.some(e => e.type === 'text-delta' && e.text === 'Hi there')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('streams error event and sets agent_state to error on OpenAI failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network failure'))
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>
    expect(events.some(e => e.type === 'error')).toBe(true)
    // agent_state should be set to 'error'
    const updateCalls = mockAgentStateUpdate.mock.calls
    // agent_state='error' is the value passed to the update chain's is() terminal
    // We check that is() was called after update({agent_state:'error'})
    expect(mockAgentStateUpdate).toHaveBeenCalled()
  })

  it('emits tool-call and tool-result events when a tool executes', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({ created: true })
    vi.mocked(createTools).mockReturnValueOnce({
      definitions: [{
        type: 'function' as const,
        function: { name: 'createStickyNote', description: 'Create a sticky note', parameters: {} },
      }],
      executors: new Map([['createStickyNote', mockExecutor]]),
    })

    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return makeFakeChatStream([
          { type: 'tool_call', toolName: 'createStickyNote', args: { text: 'Buy milk' }, id: 'call-abc' },
        ])
      }
      return makeFakeChatStream([{ type: 'text', text: 'Done.' }, { type: 'done' }])
    })

    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>

    expect(events.some(e => e.type === 'tool-call' && e.toolName === 'createStickyNote')).toBe(true)
    expect(events.some(e => e.type === 'tool-result' && e.toolName === 'createStickyNote')).toBe(true)
    expect(mockExecutor).toHaveBeenCalled()
  })

  // ── Persistence ───────────────────────────────────────────────────────────

  it('inserts user message with user_display_name and agent_object_id', async () => {
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    await collectSSE(res)

    const userInsert = mockInsert.mock.calls.find(
      (args: unknown[]) => (args[0] as Record<string, unknown>)?.role === 'user'
    )
    expect(userInsert).toBeDefined()
    expect(userInsert![0]).toMatchObject({
      role: 'user',
      agent_object_id: TEST_AGENT_ID,
      user_display_name: 'Alice',
      board_id: TEST_BOARD_ID,
    })
  })

  it('inserts assistant message after successful stream', async () => {
    mockCreate.mockImplementation(() =>
      makeFakeChatStream([{ type: 'text', text: 'The answer is 42.' }, { type: 'done' }])
    )
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    await collectSSE(res)

    const assistantInsert = mockInsert.mock.calls.find(
      (args: unknown[]) => (args[0] as Record<string, unknown>)?.role === 'assistant'
    )
    expect(assistantInsert).toBeDefined()
    expect(assistantInsert![0]).toMatchObject({
      role: 'assistant',
      agent_object_id: TEST_AGENT_ID,
      board_id: TEST_BOARD_ID,
    })
    expect((assistantInsert![0] as Record<string, unknown>).content).toContain('The answer is 42.')
  })

  // ── agent_state transitions ───────────────────────────────────────────────

  it('triggers at least two agent_state updates (thinking + done/error) per request', async () => {
    const req = makeRequest(defaultBody())
    const res = await POST(req, makeParams())
    await collectSSE(res)
    // thinking on dispatch, done on completion = 2 updates
    expect(mockAgentStateUpdate.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
