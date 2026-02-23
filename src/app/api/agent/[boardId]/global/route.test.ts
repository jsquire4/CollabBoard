/**
 * Tests for POST /api/agent/[boardId]/global
 * Uses Chat Completions (runAgentLoop) — stateless, board state injected per request.
 *
 * Also includes tests for the action registry (shared module) and
 * direct execution path (tier=direct and tier=simple-create bypass LLM).
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
  mockCreateTools,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockRunAgentLoop: vi.fn(),
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockLoadBoardState: vi.fn(),
  mockCreateTools: vi.fn(),
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
  createTools: mockCreateTools,
  createToolContext: vi.fn().mockReturnValue({}),
  getToolDefinitions: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/userUtils', () => ({
  getUserDisplayName: vi.fn().mockReturnValue('Alice'),
}))

vi.mock('@/lib/agent/sse', () => ({
  getOpenAI: vi.fn().mockReturnValue({}),
  runAgentLoop: mockRunAgentLoop,
  sseEvent: (data: Record<string, unknown>) => `data: ${JSON.stringify(data)}\n\n`,
  SSE_HEADERS: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
}))

// Import route AFTER mocks
import { POST } from './route'
import {
  ACTION_REGISTRY,
  ACTION_MAP,
  QUICK_ACTION_TOOL_GROUPS,
  getIncompatiblePairs,
  getIncompatibilityReason,
  getVisibleActions,
} from '@/lib/agent/actionRegistry'

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
  mockCreateTools.mockReturnValue({ definitions: [], executors: new Map() })
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
    // sticky and frame are simple-create tier, so they skip the LLM
    const mockStickyExecutor = vi.fn().mockResolvedValue({ id: 'new-sticky', type: 'sticky_note' })
    const mockFrameExecutor = vi.fn().mockResolvedValue({ id: 'new-frame', type: 'frame' })
    mockCreateTools.mockReturnValue({
      definitions: [],
      executors: new Map([['createStickyNote', mockStickyExecutor], ['createFrame', mockFrameExecutor]]),
    })

    const res = await POST(makeRequest({
      message: 'Add sticky and frame',
      quickActionIds: ['sticky', 'frame'],
    }), makeParams())

    expect(res.status).toBe(200)
    // Both are simple-create — no LLM call
    expect(mockRunAgentLoop).not.toHaveBeenCalled()
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
    // 25 'sticky' IDs + 5 unknown = 30 total; capped at 20 known
    const ids = Array.from({ length: 30 }, (_, i) => i < 25 ? 'sticky' : `unknown-${i}`)
    const mockStickyExecutor = vi.fn().mockResolvedValue({ id: 'new-sticky', type: 'sticky_note' })
    mockCreateTools.mockReturnValue({
      definitions: [],
      executors: new Map([['createStickyNote', mockStickyExecutor]]),
    })
    const res = await POST(makeRequest({ message: 'Go', quickActionIds: ids }), makeParams())
    // All are simple-create (sticky), so no LLM call, but should not crash
    expect(res.status).toBe(200)
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

  // ── Direct execution path tests ─────────────────────────────────────────

  describe('direct execution (no LLM)', () => {
    /** Helper to collect SSE events from a streaming Response */
    async function collectSSEEvents(res: Response): Promise<Record<string, unknown>[]> {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      const events: Record<string, unknown>[] = []
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            events.push(JSON.parse(trimmed.slice(6)))
          }
        }
      }
      return events
    }

    it('skips LLM for all-direct actions (e.g. grid layout)', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const obj2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      const mockLayoutExecutor = vi.fn().mockResolvedValue({ success: true, movedCount: 2, movedIds: [obj1, obj2] })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['layoutObjects', mockLayoutExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Arrange in Grid',
        quickActionIds: ['grid'],
        selectedIds: [obj1, obj2],
      }), makeParams())

      expect(res.status).toBe(200)
      // Should NOT call runAgentLoop — direct path
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      // Verify executor called with correct layout args
      expect(mockLayoutExecutor).toHaveBeenCalledWith({ objectIds: [obj1, obj2], layout: 'grid' })
      // Should return SSE events
      const events = await collectSSEEvents(res)
      expect(events.some(e => e.type === 'text-delta')).toBe(true)
      expect(events.some(e => e.type === 'done')).toBe(true)
      // Confirm the text mentions arrangement
      const textEvent = events.find(e => e.type === 'text-delta')
      expect(textEvent?.text).toContain('grid')
    })

    it('skips LLM for duplicate action', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockDuplicateExecutor = vi.fn().mockResolvedValue({ id: 'new-id', type: 'rectangle', duplicated: true })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['duplicateObject', mockDuplicateExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Duplicate',
        quickActionIds: ['duplicate'],
        selectedIds: [obj1],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockDuplicateExecutor).toHaveBeenCalledWith({ id: obj1 })
    })

    it('skips LLM for simple-create actions (sticky)', async () => {
      const mockStickyExecutor = vi.fn().mockResolvedValue({ id: 'new-sticky', type: 'sticky_note' })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['createStickyNote', mockStickyExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Add Sticky Note',
        quickActionIds: ['sticky'],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockStickyExecutor).toHaveBeenCalledOnce()
    })

    it('uses LLM for llm-tier actions (swot)', async () => {
      const res = await POST(makeRequest({
        message: '1. SWOT Analysis',
        quickActionIds: ['swot'],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).toHaveBeenCalledOnce()
    })

    it('handles mixed direct + LLM actions', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockDuplicateExecutor = vi.fn().mockResolvedValue({ id: 'new-id', duplicated: true })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['duplicateObject', mockDuplicateExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Duplicate\n2. SWOT Analysis',
        quickActionIds: ['duplicate', 'swot'],
        selectedIds: [obj1],
      }), makeParams())

      expect(res.status).toBe(200)
      // Should execute duplicate directly, then call LLM for SWOT
      expect(mockDuplicateExecutor).toHaveBeenCalledOnce()
      expect(mockRunAgentLoop).toHaveBeenCalledOnce()

      // LLM should receive context about already-executed direct actions
      const config = mockRunAgentLoop.mock.calls[0][1]
      const userMsg = config.messages.find((m: { role: string }) => m.role === 'user')
      expect(userMsg.content).toContain('Already executed')
      expect(userMsg.content).toContain('Duplicated')
    })

    it('injects template instructions into system prompt for LLM template actions', async () => {
      await POST(makeRequest({
        message: '1. SWOT Analysis',
        quickActionIds: ['swot'],
      }), makeParams())

      const config = mockRunAgentLoop.mock.calls[0][1]
      const systemMsg = config.messages.find((m: { role: string }) => m.role === 'system')
      expect(systemMsg.content).toContain('## Template instructions')
      expect(systemMsg.content).toContain('SWOT Analysis')
    })

    it('handles direct action failures gracefully', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockLayoutExecutor = vi.fn().mockResolvedValue({ error: 'No objects found to arrange' })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['layoutObjects', mockLayoutExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Arrange in Grid',
        quickActionIds: ['grid'],
        selectedIds: [obj1],
      }), makeParams())

      expect(res.status).toBe(200)
      const events = await collectSSEEvents(res)
      const textEvent = events.find(e => e.type === 'text-delta')
      expect(textEvent?.text).toContain('issues')
    })

    it('skips LLM for group action', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const obj2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      const mockGroupExecutor = vi.fn().mockResolvedValue({ groupId: 'new-group', childCount: 2 })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['groupObjects', mockGroupExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Group',
        quickActionIds: ['group'],
        selectedIds: [obj1, obj2],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockGroupExecutor).toHaveBeenCalledWith({ objectIds: [obj1, obj2] })
    })

    it('skips LLM for bring-front action', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockZIndexExecutor = vi.fn().mockResolvedValue({ id: obj1, action: 'front', updated: 1 })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['updateZIndex', mockZIndexExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Bring to Front',
        quickActionIds: ['bring-front'],
        selectedIds: [obj1],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockZIndexExecutor).toHaveBeenCalledWith({ id: obj1, action: 'front' })
    })

    it('skips LLM for send-back action', async () => {
      const obj1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockZIndexExecutor = vi.fn().mockResolvedValue({ id: obj1, action: 'back', updated: 1 })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['updateZIndex', mockZIndexExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Send to Back',
        quickActionIds: ['send-back'],
        selectedIds: [obj1],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockZIndexExecutor).toHaveBeenCalledWith({ id: obj1, action: 'back' })
    })

    it('skips LLM for ungroup action', async () => {
      const grp1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockUngroupExecutor = vi.fn().mockResolvedValue({ ungrouped: true, childCount: 3 })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['ungroupObjects', mockUngroupExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Ungroup',
        quickActionIds: ['ungroup'],
        selectedIds: [grp1],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockUngroupExecutor).toHaveBeenCalledWith({ groupId: grp1 })
    })

    it('skips LLM for add-table-row action', async () => {
      const tbl1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      const mockAddRowExecutor = vi.fn().mockResolvedValue({ success: true, rowCount: 4 })
      mockCreateTools.mockReturnValue({
        definitions: [],
        executors: new Map([['addTableRow', mockAddRowExecutor]]),
      })

      const res = await POST(makeRequest({
        message: '1. Add Table Row',
        quickActionIds: ['add-table-row'],
        selectedIds: [tbl1],
      }), makeParams())

      expect(res.status).toBe(200)
      expect(mockRunAgentLoop).not.toHaveBeenCalled()
      expect(mockAddRowExecutor).toHaveBeenCalledWith({ objectId: tbl1 })
    })

    it('injects non-template LLM action prompts into system prompt', async () => {
      await POST(makeRequest({
        message: '1. Recolor Selected',
        quickActionIds: ['color-all'],
        selectedIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
      }), makeParams())

      const config = mockRunAgentLoop.mock.calls[0][1]
      const systemMsg = config.messages.find((m: { role: string }) => m.role === 'system')
      expect(systemMsg.content).toContain('## Action instructions')
      expect(systemMsg.content).toContain('Recolor Selected')
    })
  })
})

// ── Action Registry tests ───────────────────────────────────────────────────

describe('ACTION_REGISTRY', () => {
  it('has 24 actions', () => {
    expect(ACTION_REGISTRY).toHaveLength(24)
  })

  it('every action has required fields', () => {
    for (const action of ACTION_REGISTRY) {
      expect(action.id, `${action.id} id`).toBeTruthy()
      expect(action.label, `${action.id} label`).toBeTruthy()
      expect(action.category, `${action.id} category`).toBeTruthy()
      expect(['direct', 'llm', 'simple-create']).toContain(action.tier)
      expect(action.prompt, `${action.id} prompt`).toBeTruthy()
      expect(action.toolNames.length, `${action.id} toolNames`).toBeGreaterThan(0)
    }
  })

  it('all IDs are unique', () => {
    const ids = ACTION_REGISTRY.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('direct and simple-create actions have confirmMessage', () => {
    const nonLlm = ACTION_REGISTRY.filter(a => a.tier !== 'llm')
    for (const action of nonLlm) {
      expect(action.confirmMessage, `${action.id} should have confirmMessage`).toBeTruthy()
    }
  })
})

describe('ACTION_MAP', () => {
  it('has entries for all registry actions', () => {
    for (const action of ACTION_REGISTRY) {
      expect(ACTION_MAP[action.id]).toBe(action)
    }
  })
})

describe('QUICK_ACTION_TOOL_GROUPS', () => {
  it('mirrors registry toolNames', () => {
    for (const action of ACTION_REGISTRY) {
      expect(QUICK_ACTION_TOOL_GROUPS[action.id]).toEqual(action.toolNames)
    }
  })
})

describe('tier classification', () => {
  it('correct count per tier', () => {
    const direct = ACTION_REGISTRY.filter(a => a.tier === 'direct')
    const simpleCreate = ACTION_REGISTRY.filter(a => a.tier === 'simple-create')
    const llm = ACTION_REGISTRY.filter(a => a.tier === 'llm')
    // 10 direct + 4 simple-create + 10 llm = 24
    expect(direct).toHaveLength(10)
    expect(simpleCreate).toHaveLength(4)
    expect(llm).toHaveLength(10)
  })

  it('direct includes layout and organize actions', () => {
    const directIds = new Set(ACTION_REGISTRY.filter(a => a.tier === 'direct').map(a => a.id))
    for (const id of ['grid', 'horizontal', 'vertical', 'circle', 'duplicate', 'group', 'ungroup', 'bring-front', 'send-back', 'add-table-row']) {
      expect(directIds.has(id), id).toBe(true)
    }
  })
})

describe('getIncompatiblePairs', () => {
  it('returns empty for single action', () => {
    expect(getIncompatiblePairs(['grid'])).toEqual([])
  })

  it('returns empty for compatible actions', () => {
    expect(getIncompatiblePairs(['duplicate', 'group'])).toEqual([])
  })

  it('detects create + layout', () => {
    const pairs = getIncompatiblePairs(['sticky', 'grid'])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual(['sticky', 'grid'])
  })

  it('detects layout + layout', () => {
    expect(getIncompatiblePairs(['grid', 'horizontal'])).toHaveLength(1)
  })

  it('detects template + edit', () => {
    expect(getIncompatiblePairs(['swot', 'color-all'])).toHaveLength(1)
  })

  it('ignores unknown IDs', () => {
    expect(getIncompatiblePairs(['unknown', 'grid'])).toEqual([])
  })
})

describe('getIncompatibilityReason', () => {
  it('returns null for compatible', () => {
    expect(getIncompatibilityReason('duplicate', 'group')).toBeNull()
  })

  it('returns reason for create + layout', () => {
    expect(getIncompatibilityReason('sticky', 'grid')).toContain('layout needs existing objects')
  })

  it('returns reason for layout + layout', () => {
    expect(getIncompatibilityReason('grid', 'horizontal')).toContain("can't apply two layouts")
  })
})

describe('getVisibleActions', () => {
  it('shows non-selection-required actions with empty selection', () => {
    const visible = getVisibleActions(new Set(), new Map())
    const ids = visible.map(a => a.id)
    expect(ids).toContain('sticky')
    expect(ids).toContain('summarize')
    expect(ids).not.toContain('grid')
    expect(ids).not.toContain('duplicate')
  })

  it('shows layout actions with sufficient selection', () => {
    const sel = new Set(['id1', 'id2'])
    const objs = new Map<string, { type?: string }>([['id1', { type: 'rectangle' }], ['id2', { type: 'circle' }]])
    const ids = getVisibleActions(sel, objs).map(a => a.id)
    expect(ids).toContain('horizontal')
    expect(ids).toContain('group')
  })

  it('shows ungroup only when group selected', () => {
    const sel = new Set(['id1'])
    const withGroup = new Map<string, { type?: string }>([['id1', { type: 'group' }]])
    const withRect = new Map<string, { type?: string }>([['id1', { type: 'rectangle' }]])
    expect(getVisibleActions(sel, withGroup).map(a => a.id)).toContain('ungroup')
    expect(getVisibleActions(sel, withRect).map(a => a.id)).not.toContain('ungroup')
  })

  it('shows table actions only when table selected', () => {
    const sel = new Set(['id1'])
    const withTable = new Map<string, { type?: string }>([['id1', { type: 'table' }]])
    expect(getVisibleActions(sel, withTable).map(a => a.id)).toContain('add-table-row')
    expect(getVisibleActions(sel, withTable).map(a => a.id)).toContain('read-table')
  })
})
