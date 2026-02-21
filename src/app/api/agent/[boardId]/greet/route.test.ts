/**
 * Tests for POST /api/agent/[boardId]/greet
 * Key paths: UUID validation, env check, auth, membership, SSE streaming,
 * new vs. existing board prompts, body parse failure, OpenAI error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { collectSSE } from '@/test/sseHelpers'
import { makeFakeChatStream } from '@/test/mocks/openai'

// ── Hoisted spies (available inside vi.mock factories) ────────────────────────
const { mockGetUser, mockMemberSingle, mockCreate } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockCreate: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockMemberSingle,
    })),
  }),
}))

vi.mock('@/lib/agent/sse', () => ({
  getOpenAI: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

// Import route AFTER mocks are registered
import { POST } from './route'

// ── Test helpers ──────────────────────────────────────────────────────────────
const TEST_BOARD_ID = '00000000-0000-0000-0000-000000000001'

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/greet`, {
    method: 'POST',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  })
}

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

// ── Shared setup ──────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-123', email: 'test@test.com' } },
    error: null,
  })
  mockMemberSingle.mockResolvedValue({
    data: { role: 'editor' },
    error: null,
  })
  mockCreate.mockImplementation(() =>
    makeFakeChatStream([{ type: 'text', text: 'Hello!' }, { type: 'done' }])
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/agent/[boardId]/greet', () => {
  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 for a non-UUID boardId', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ boardId: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/invalid board/i) })
  })

  it('returns 400 for a boardId that is the wrong format (looks like UUID but is not)', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ boardId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }) })
    expect(res.status).toBe(400)
  })

  // ── Environment ─────────────────────────────────────────────────────────────

  it('returns 500 when OPENAI_API_KEY is an empty string', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/OPENAI_API_KEY/i) })
  })

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when getUser returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/unauthorized/i) })
  })

  it('returns 401 when getUser returns null user without error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  // ── Membership / authorization ──────────────────────────────────────────────

  it('returns 403 when the user is not a board member', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: null, error: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/forbidden/i) })
  })

  it('allows a viewer-role member to receive a greeting', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
  })

  it('allows an editor-role member to receive a greeting', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: { role: 'editor' }, error: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
  })

  it('allows an owner-role member to receive a greeting', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
  })

  // ── SSE headers ─────────────────────────────────────────────────────────────

  it('returns correct SSE response headers', async () => {
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Connection')).toBe('keep-alive')
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
  })

  // ── SSE streaming — happy path (existing board) ─────────────────────────────

  it('streams text-delta events followed by a done event for an existing board', async () => {
    mockCreate.mockImplementation(() =>
      makeFakeChatStream([
        { type: 'text', text: 'Welcome back' },
        { type: 'text', text: '!' },
        { type: 'done' },
      ])
    )
    const res = await POST(makeRequest({}), makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>

    const textDeltas = events.filter(e => e.type === 'text-delta')
    expect(textDeltas.length).toBeGreaterThanOrEqual(1)
    expect(textDeltas.some(e => e.text === 'Welcome back')).toBe(true)
    expect(textDeltas.some(e => e.text === '!')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('uses the shorter (1-2 sentence) prompt when isNewBoard is absent', async () => {
    await POST(makeRequest({}), makeParams())

    const call = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toMatch(/work with their board/i)
    expect(prompt).toMatch(/1-2 sentences/i)
  })

  it('uses the shorter prompt when isNewBoard is explicitly false', async () => {
    await POST(makeRequest({ isNewBoard: false }), makeParams())

    const call = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toMatch(/1-2 sentences/i)
  })

  // ── SSE streaming — new board ───────────────────────────────────────────────

  it('streams text-delta events followed by a done event for a new board', async () => {
    mockCreate.mockImplementation(() =>
      makeFakeChatStream([
        { type: 'text', text: 'Welcome to your new board!' },
        { type: 'done' },
      ])
    )
    const res = await POST(makeRequest({ isNewBoard: true }), makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>

    expect(events.some(e => e.type === 'text-delta' && e.text === 'Welcome to your new board!')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('uses the longer (2-3 sentence) prompt when isNewBoard is true', async () => {
    await POST(makeRequest({ isNewBoard: true }), makeParams())

    const call = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toMatch(/new blank board/i)
    expect(prompt).toMatch(/2-3 sentences/i)
  })

  it('calls the OpenAI completions API with the gpt-4o-mini model', async () => {
    await POST(makeRequest({}), makeParams())

    const call = mockCreate.mock.calls[0]?.[0] as { model: string; stream: boolean }
    expect(call.model).toBe('gpt-4o-mini')
    expect(call.stream).toBe(true)
  })

  // ── Body parse failure ──────────────────────────────────────────────────────

  it('gracefully handles a request with no body and defaults to existing-board behaviour', async () => {
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)

    // Should have used the shorter existing-board prompt
    const call = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toMatch(/1-2 sentences/i)
  })

  it('gracefully handles a non-JSON body and defaults to existing-board behaviour', async () => {
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/greet`, {
      method: 'POST',
      body: 'this is not json',
      headers: { 'Content-Type': 'text/plain' },
    })
    const res = await POST(req, makeParams())
    expect(res.status).toBe(200)

    const call = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toMatch(/1-2 sentences/i)
  })

  // ── OpenAI error during streaming ───────────────────────────────────────────

  it('streams an error event when OpenAI throws during streaming', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network failure'))
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await collectSSE(res) as Array<Record<string, unknown>>
    expect(events.some(e => e.type === 'error')).toBe(true)
    const errorEvent = events.find(e => e.type === 'error') as Record<string, unknown>
    expect(errorEvent.error).toMatch(/failed to generate greeting/i)
  })

  it('does not stream a done event after an OpenAI error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('timeout'))
    const res = await POST(makeRequest({}), makeParams())
    const events = await collectSSE(res) as Array<Record<string, unknown>>

    expect(events.some(e => e.type === 'done')).toBe(false)
    expect(events.some(e => e.type === 'error')).toBe(true)
  })
})
