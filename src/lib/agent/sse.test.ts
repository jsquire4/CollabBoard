/**
 * Tests for SSE streaming loop — both runAgentLoop and runAssistantsLoop.
 * Strategy: Mock OpenAI SDK, test event emission via ReadableStream.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sseEvent, SSE_HEADERS, getOpenAI, runAgentLoop, runAssistantsLoop } from './sse'
import type { AgentLoopConfig, AssistantsLoopConfig } from './sse'
import type OpenAI from 'openai'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all SSE events from a ReadableStream into parsed objects */
async function collectEvents(stream: ReadableStream): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader()
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

/** Create a fake async iterable that yields chat completion chunks */
function* makeFakeChunks(chunks: Array<{
  content?: string
  toolCalls?: Array<{ index: number; id?: string; name?: string; args?: string }>
  finishReason?: string | null
}>) {
  for (const chunk of chunks) {
    const delta: Record<string, unknown> = {}
    if (chunk.content) delta.content = chunk.content
    if (chunk.toolCalls) {
      delta.tool_calls = chunk.toolCalls.map(tc => ({
        index: tc.index,
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.args,
        },
      }))
    }
    yield {
      id: 'chatcmpl-1',
      choices: [{
        index: 0,
        delta,
        finish_reason: chunk.finishReason ?? null,
      }],
    }
  }
}

async function* asyncGen<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

function makeAgentConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    messages: [],
    tools: [],
    model: 'gpt-4o',
    executors: new Map(),
    onMessage: vi.fn(),
    onToolResult: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  }
}

function makeAssistantsConfig(overrides: Partial<AssistantsLoopConfig> = {}): AssistantsLoopConfig {
  return {
    threadId: 'thread-1',
    assistantId: 'asst-1',
    executors: new Map(),
    onDone: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SSE helpers', () => {
  describe('sseEvent', () => {
    it('formats as data: {...}\\n\\n', () => {
      const result = sseEvent({ type: 'test', value: 42 })
      expect(result).toBe('data: {"type":"test","value":42}\n\n')
    })
  })

  describe('SSE_HEADERS', () => {
    it('has Content-Type: text/event-stream', () => {
      expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream')
    })

    it('has Cache-Control, Connection, X-Accel-Buffering', () => {
      expect(SSE_HEADERS['Cache-Control']).toBe('no-cache')
      expect(SSE_HEADERS['Connection']).toBe('keep-alive')
      expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no')
    })
  })

  describe('getOpenAI', () => {
    it('is exported as a function', () => {
      expect(typeof getOpenAI).toBe('function')
    })
  })
})

describe('runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text-only response emits text-delta then done', async () => {
    const chunks = [
      { content: 'Hello ' },
      { content: 'world', finishReason: 'stop' },
    ]
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(asyncGen([...makeFakeChunks(chunks)])),
        },
      },
    } as unknown as OpenAI

    const config = makeAgentConfig()
    const stream = runAgentLoop(openai, config)
    const events = await collectEvents(stream)

    expect(events.filter(e => e.type === 'text-delta')).toHaveLength(2)
    expect(events[events.length - 1].type).toBe('done')
    expect(config.onDone).toHaveBeenCalledOnce()
  })

  it('tool call: emits tool-call, executes, emits tool-result, continues', async () => {
    const toolChunks = [
      { toolCalls: [{ index: 0, id: 'call-1', name: 'testTool', args: '{"x":1}' }], finishReason: 'tool_calls' },
    ]
    const textChunks = [
      { content: 'Done', finishReason: 'stop' },
    ]

    let callCount = 0
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 1) return Promise.resolve(asyncGen([...makeFakeChunks(toolChunks)]))
            return Promise.resolve(asyncGen([...makeFakeChunks(textChunks)]))
          }),
        },
      },
    } as unknown as OpenAI

    const executor = vi.fn().mockResolvedValue({ result: 'ok' })
    const config = makeAgentConfig({
      executors: new Map([['testTool', executor]]),
    })

    const stream = runAgentLoop(openai, config)
    const events = await collectEvents(stream)

    const toolCallEvents = events.filter(e => e.type === 'tool-call')
    const toolResultEvents = events.filter(e => e.type === 'tool-result')
    expect(toolCallEvents).toHaveLength(1)
    expect(toolResultEvents).toHaveLength(1)
    expect(executor).toHaveBeenCalledWith({ x: 1 })
    expect(config.onToolResult).toHaveBeenCalledWith('testTool', { result: 'ok' })
  })

  it('unknown tool returns error result', async () => {
    const chunks = [
      { toolCalls: [{ index: 0, id: 'call-1', name: 'unknownTool', args: '{}' }], finishReason: 'tool_calls' },
    ]
    const textChunks = [{ content: '', finishReason: 'stop' }]

    let callCount = 0
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 1) return Promise.resolve(asyncGen([...makeFakeChunks(chunks)]))
            return Promise.resolve(asyncGen([...makeFakeChunks(textChunks)]))
          }),
        },
      },
    } as unknown as OpenAI

    const config = makeAgentConfig()
    const stream = runAgentLoop(openai, config)
    const events = await collectEvents(stream)

    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult?.result).toEqual({ error: 'Unknown tool: unknownTool' })
  })

  it('stops after MAX_STEPS (10) iterations', async () => {
    // Every call returns a tool call to force looping
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(() => {
            const chunks = [
              { toolCalls: [{ index: 0, id: `call-${Math.random()}`, name: 'loop', args: '{}' }], finishReason: 'tool_calls' },
            ]
            return Promise.resolve(asyncGen([...makeFakeChunks(chunks)]))
          }),
        },
      },
    } as unknown as OpenAI

    const executor = vi.fn().mockResolvedValue({ ok: true })
    const config = makeAgentConfig({
      executors: new Map([['loop', executor]]),
    })

    const stream = runAgentLoop(openai, config)
    await collectEvents(stream)

    // Should have been called exactly 10 times (MAX_STEPS)
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(10)
  })

  it('429 error emits rate limit message', async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
        },
      },
    } as unknown as OpenAI

    const config = makeAgentConfig()
    const stream = runAgentLoop(openai, config)
    const events = await collectEvents(stream)

    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent?.error).toBe('Rate limit reached, please try again.')
  })

  it('generic error emits error event and calls onError', async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Connection failed')),
        },
      },
    } as unknown as OpenAI

    const config = makeAgentConfig()
    const stream = runAgentLoop(openai, config)
    const events = await collectEvents(stream)

    const errorEvent = events.find(e => e.type === 'error')
    expect(errorEvent?.error).toBe('An error occurred. Please try again.')
    expect(config.onError).toHaveBeenCalledOnce()
  })

  it('truncates tool args at 4096 chars', async () => {
    const longArgs = 'x'.repeat(5000)
    const chunks = [
      { toolCalls: [{ index: 0, id: 'call-1', name: 'testTool', args: `{"data":"${longArgs}"}` }], finishReason: 'tool_calls' },
    ]
    const textChunks = [{ content: '', finishReason: 'stop' }]

    let callCount = 0
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++
            if (callCount === 1) return Promise.resolve(asyncGen([...makeFakeChunks(chunks)]))
            return Promise.resolve(asyncGen([...makeFakeChunks(textChunks)]))
          }),
        },
      },
    } as unknown as OpenAI

    const config = makeAgentConfig({
      executors: new Map([['testTool', vi.fn().mockResolvedValue({})]]),
    })

    const stream = runAgentLoop(openai, config)
    await collectEvents(stream)

    // The onMessage callback should receive truncated args
    expect(config.onMessage).toHaveBeenCalled()
    const assistantMsg = (config.onMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const toolCallArgs = assistantMsg.tool_calls[0].function.arguments
    expect(toolCallArgs.length).toBeLessThanOrEqual(4096)
  })
})

describe('runAssistantsLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text response emits text-delta events then done', async () => {
    const events = [
      {
        event: 'thread.message.delta',
        data: {
          delta: {
            content: [{ type: 'text', text: { value: 'Hello world' } }],
          },
        },
      },
      { event: 'thread.run.completed', data: {} },
    ]

    const openai = {
      beta: {
        threads: {
          runs: {
            stream: vi.fn(() => asyncGen(events)),
          },
        },
      },
    } as unknown as OpenAI

    const config = makeAssistantsConfig()
    const stream = runAssistantsLoop(openai, config)
    const sseEvents = await collectEvents(stream)

    const textDeltas = sseEvents.filter(e => e.type === 'text-delta')
    expect(textDeltas).toHaveLength(1)
    expect(textDeltas[0].text).toBe('Hello world')
    expect(sseEvents[sseEvents.length - 1].type).toBe('done')
    expect(config.onDone).toHaveBeenCalledWith('Hello world')
  })

  it('tool call via requires_action submits tool outputs and loops', async () => {
    const requiresActionEvents = [
      {
        event: 'thread.run.requires_action',
        data: {
          id: 'run-1',
          required_action: {
            submit_tool_outputs: {
              tool_calls: [{
                id: 'tc-1',
                function: { name: 'testTool', arguments: '{"a":1}' },
              }],
            },
          },
        },
      },
    ]

    const completedEvents = [
      {
        event: 'thread.message.delta',
        data: { delta: { content: [{ type: 'text', text: { value: 'Result' } }] } },
      },
      { event: 'thread.run.completed', data: {} },
    ]

    let streamCallCount = 0
    const openai = {
      beta: {
        threads: {
          runs: {
            stream: vi.fn(() => {
              streamCallCount++
              return asyncGen(streamCallCount === 1 ? requiresActionEvents : [])
            }),
            submitToolOutputsStream: vi.fn(() => asyncGen(completedEvents)),
          },
        },
      },
    } as unknown as OpenAI

    const executor = vi.fn().mockResolvedValue({ result: 'done' })
    const config = makeAssistantsConfig({
      executors: new Map([['testTool', executor]]),
    })

    const stream = runAssistantsLoop(openai, config)
    const sseEvents = await collectEvents(stream)

    expect(executor).toHaveBeenCalledWith({ a: 1 })
    const toolCallEvents = sseEvents.filter(e => e.type === 'tool-call')
    expect(toolCallEvents).toHaveLength(1)
    expect(openai.beta.threads.runs.submitToolOutputsStream).toHaveBeenCalled()
  })

  it('unknown tool in Assistants loop returns error result', async () => {
    const events = [
      {
        event: 'thread.run.requires_action',
        data: {
          id: 'run-1',
          required_action: {
            submit_tool_outputs: {
              tool_calls: [{
                id: 'tc-1',
                function: { name: 'unknownTool', arguments: '{}' },
              }],
            },
          },
        },
      },
    ]

    const completedEvents = [{ event: 'thread.run.completed', data: {} }]

    const openai = {
      beta: {
        threads: {
          runs: {
            stream: vi.fn(() => asyncGen(events)),
            submitToolOutputsStream: vi.fn(() => asyncGen(completedEvents)),
          },
        },
      },
    } as unknown as OpenAI

    const config = makeAssistantsConfig()
    const stream = runAssistantsLoop(openai, config)
    const sseEvents = await collectEvents(stream)

    const toolResult = sseEvents.find(e => e.type === 'tool-result')
    expect(toolResult?.result).toEqual({ error: 'Unknown tool: unknownTool' })
  })

  it('failed run emits error event', async () => {
    const events = [
      {
        event: 'thread.run.failed',
        data: { last_error: { message: 'Run failed badly' } },
      },
    ]

    const openai = {
      beta: {
        threads: {
          runs: {
            stream: vi.fn(() => asyncGen(events)),
          },
        },
      },
    } as unknown as OpenAI

    const config = makeAssistantsConfig()
    const stream = runAssistantsLoop(openai, config)
    const sseEvents = await collectEvents(stream)

    const errorEvent = sseEvents.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(config.onError).toHaveBeenCalled()
  })

  it('cancelled run emits error event', async () => {
    const events = [
      { event: 'thread.run.cancelled', data: {} },
    ]

    const openai = {
      beta: {
        threads: {
          runs: {
            stream: vi.fn(() => asyncGen(events)),
          },
        },
      },
    } as unknown as OpenAI

    const config = makeAssistantsConfig()
    const stream = runAssistantsLoop(openai, config)
    const sseEvents = await collectEvents(stream)

    const errorEvent = sseEvents.find(e => e.type === 'error')
    expect(errorEvent).toBeDefined()
  })
})
