import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { makeFakeSSE } from '@/test/sseHelpers'

// Mock createClient (Supabase browser client)
// Chain: .select().eq(board_id).eq|is(agent_filter).order().limit()
vi.mock('@/lib/supabase/client', () => {
  const terminalResult = { data: [], error: null }
  const orderChain = {
    order: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(terminalResult)),
    })),
  }
  const filterChain = {
    eq: vi.fn(() => orderChain),
    is: vi.fn(() => orderChain),
  }
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => filterChain),
        })),
      })),
    })),
  }
})

// We'll import useAgentChat dynamically after mocks are set up
import { useAgentChat } from './useAgentChat'

describe('useAgentChat', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeFakeSSE([
        { type: 'text-delta', text: 'Hello!' },
        { type: 'done' },
      ])),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('greets on mount when enabled (per-agent mode)', async () => {
    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' } }),
    )
    // Per-agent mode greets on mount — expect a streaming assistant message
    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg).toBeTruthy()
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('includes agentObjectId in POST body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body.agentObjectId).toBe('agent-1')
      expect(body.message).toBe('Hello agent')
      return Promise.resolve(makeFakeSSE([{ type: 'done' }]))
    })

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Hello agent')
    })

    expect(fetchMock).toHaveBeenCalled()
  })

  it('sends to correct URL with boardId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      expect(String(url)).toBe('/api/agent/board-test-123')
      return Promise.resolve(makeFakeSSE([{ type: 'done' }]))
    })

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-test-123', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('test')
    })

    expect(fetchMock).toHaveBeenCalled()
  })

  it('accumulates text-delta events into message content', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeFakeSSE([
        { type: 'text-delta', text: 'Hello' },
        { type: 'text-delta', text: ' world' },
        { type: 'done' },
      ])),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Hi')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.content).toBe('Hello world')
    })
  })

  it('handles tool-call events', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeFakeSSE([
        { type: 'tool-call', toolName: 'createStickyNote', args: { text: 'Note' } },
        { type: 'done' },
      ])),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Create a note')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.toolCalls?.[0].toolName).toBe('createStickyNote')
    })
  })

  it('handles tool-result events', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeFakeSSE([
        { type: 'tool-result', toolName: 'createStickyNote', result: { id: 'xyz' } },
        { type: 'done' },
      ])),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Create a note')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.toolResults?.[0].toolName).toBe('createStickyNote')
    })
  })

  it('clears isStreaming on done event', async () => {
    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Hi')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.isStreaming).toBe(false)
    })
  })

  it('sets error state on error event', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeFakeSSE([
        { type: 'error', error: 'Rate limit reached' },
      ])),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Hi')
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Rate limit reached')
    })
  })

  it('per-agent mode skips board_messages query (ephemeral)', async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const fromFn = vi.fn()
    vi.mocked(createClient).mockReturnValueOnce({
      from: fromFn,
    } as unknown as ReturnType<typeof createClient>)

    renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'my-agent-id' }, enabled: true }),
    )

    await waitFor(() => {
      // Per-agent mode is ephemeral — should NOT query board_messages
      expect(fromFn).not.toHaveBeenCalled()
    })
  })

  it('skips malformed JSON in SSE data lines without crashing', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: not-valid-json\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"hi"}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
        controller.close()
      },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(stream, { status: 200 })),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    // Should not throw
    await act(async () => {
      await result.current.sendMessage('test')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.content).toBe('hi')
    })
  })

  it('handles SSE chunk boundary (data: line split across read() calls)', async () => {
    // Simulate chunk split mid-data-line
    const encoder = new TextEncoder()
    let callCount = 0
    const stream = new ReadableStream({
      start(controller) {
        // Split the SSE event across two chunks
        controller.enqueue(encoder.encode('data: {"type":"text-del'))
        controller.enqueue(encoder.encode('ta","text":"ok"}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
        controller.close()
      },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(stream, { status: 200 })),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('test')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      // The hook buffers by '\n' splits so cross-chunk data should be reconstructed
      expect(assistantMsg?.isStreaming).toBe(false)
      // Also verify the content was not lost across the chunk boundary
      expect(assistantMsg?.content).toBe('ok')
    })
  })

  it('does not send if isLoading is true', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      // Never resolves
      new Promise(() => {}),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    // Start a message that won't complete
    act(() => { void result.current.sendMessage('first') })

    // Try to send another while loading
    await act(async () => {
      await result.current.sendMessage('second')
    })

    // Fetch should only be called once
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancel() aborts the current request', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise(() => {}), // never resolves
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    act(() => { void result.current.sendMessage('test') })

    await act(async () => {
      result.current.cancel()
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('sets error message on HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('Hi')
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })

  it('adds user message optimistically before fetch completes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise(() => {}), // never resolves
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    act(() => { void result.current.sendMessage('My message') })

    expect(result.current.messages.some(m => m.content === 'My message')).toBe(true)
  })

  it('adds assistant streaming placeholder before response arrives', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise(() => {}),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    act(() => { void result.current.sendMessage('Hi') })

    const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.isStreaming).toBe(true)
  })

  it('empty message does not trigger fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('handles HTTP 403 with user-visible error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{"error":"Forbidden"}', { status: 403 })),
    )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('hi')
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })

  it('resets error on new message send', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() =>
        Promise.resolve(new Response('error', { status: 500 })),
      )
      .mockImplementation(() =>
        Promise.resolve(makeFakeSSE([{ type: 'done' }])),
      )

    const { result } = renderHook(() =>
      useAgentChat({ boardId: 'board-1', mode: { type: 'agent', agentObjectId: 'agent-1' }, enabled: false }),
    )

    await act(async () => {
      await result.current.sendMessage('first') // causes error
    })

    await waitFor(() => expect(result.current.error).toBeTruthy())

    await act(async () => {
      await result.current.sendMessage('second') // should clear error
    })

    await waitFor(() => expect(result.current.error).toBeNull())
  })
})
