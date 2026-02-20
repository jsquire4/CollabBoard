/**
 * Tests for POST /api/agent/[boardId]/global
 * Key differences from per-agent route: no agentObjectId, message prefixed with [Name (role)]:,
 * history scoped by agent_object_id IS NULL, no agent_state transitions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { collectSSE } from '@/test/sseHelpers'
import { makeFakeChatStream } from '@/test/mocks/openai'

// ── Hoisted constants + spies ─────────────────────────────────────────────────
const { TEST_BOARD_ID, mockCreate, mockInsert, mockIsCall, mockGetUser, mockMemberSingle } = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockCreate: vi.fn(),
  mockInsert: vi.fn(),
  mockIsCall: vi.fn(),
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
          is: mockIsCall,
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: mockInsert,
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

vi.mock('@/lib/agent/tools', () => ({
  createTools: vi.fn().mockReturnValue({ definitions: [], executors: new Map() }),
  createToolContext: vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: vi.fn().mockReturnValue('Alice'),
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
  mockInsert.mockResolvedValue({ data: null, error: null })
  // .is() in history chain must be chainable (returns object with order/limit)
  mockIsCall.mockReturnValue({
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  })
  mockCreate.mockImplementation(() =>
    makeFakeChatStream([{ type: 'text', text: 'Hello from global' }, { type: 'done' }])
  )
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

  it('streams text-delta and done events', async () => {
    const res = await POST(makeRequest({ message: 'Summarize' }), makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>
    expect(events.some(e => e.type === 'text-delta')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('prefixes user message with [DisplayName (role)]: before persisting', async () => {
    const res = await POST(makeRequest({ message: 'Hello board' }), makeParams())
    await collectSSE(res)

    const userInsert = mockInsert.mock.calls.find(
      (args: unknown[]) => (args[0] as Record<string, unknown>)?.role === 'user'
    )
    expect(userInsert).toBeDefined()
    const content = (userInsert![0] as Record<string, unknown>).content as string
    expect(content).toMatch(/^\[Alice \(editor\)\]: Hello board$/)
  })

  it('persists user message with agent_object_id as null', async () => {
    const res = await POST(makeRequest({ message: 'Hi' }), makeParams())
    await collectSSE(res)

    const userInsert = mockInsert.mock.calls.find(
      (args: unknown[]) => (args[0] as Record<string, unknown>)?.role === 'user'
    )
    expect(userInsert).toBeDefined()
    expect((userInsert![0] as Record<string, unknown>).agent_object_id).toBeNull()
  })

  it('queries history with .is("agent_object_id", null) filter', async () => {
    await POST(makeRequest({ message: 'Hi' }), makeParams())
    // The history query should call .is('agent_object_id', null)
    expect(mockIsCall).toHaveBeenCalledWith('agent_object_id', null)
  })
})
