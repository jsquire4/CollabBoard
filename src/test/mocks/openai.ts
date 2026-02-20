/**
 * OpenAI mock helpers for testing agent routes.
 */

import { vi } from 'vitest'

export interface FakeChunk {
  type: 'text' | 'tool_call' | 'done'
  text?: string
  toolName?: string
  args?: unknown
  id?: string
}

/** Create a fake async iterable that yields ChatCompletionChunk-like objects. */
export function makeFakeChatStream(chunks: FakeChunk[]) {
  let toolCallIndex = 0
  const messages = chunks.map((chunk, i) => {
    if (chunk.type === 'text') {
      return {
        id: `chatcmpl-${i}`,
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          delta: { content: chunk.text ?? '', role: 'assistant' },
          finish_reason: null,
        }],
      }
    }
    if (chunk.type === 'tool_call') {
      const idx = toolCallIndex++
      return {
        id: `chatcmpl-${i}`,
        object: 'chat.completion.chunk',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: idx,
              id: chunk.id ?? `call-${idx}`,
              type: 'function',
              function: {
                name: chunk.toolName ?? 'unknown',
                arguments: JSON.stringify(chunk.args ?? {}),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      }
    }
    // done
    return {
      id: `chatcmpl-${i}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    }
  })

  async function* gen() {
    for (const msg of messages) yield msg
  }

  return gen()
}

/** Create a mock OpenAI client that streams the given chunks. */
export function makeMockOpenAI(chunks: FakeChunk[]) {
  const stream = makeFakeChatStream(chunks)
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(stream),
      },
    },
  }
}
