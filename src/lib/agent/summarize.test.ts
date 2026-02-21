/**
 * Tests for token estimation and history summarization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type OpenAI from 'openai'
import {
  estimateTokens,
  capHistory,
  HARD_CAP_TOKENS,
  SUMMARY_THRESHOLD_TOKENS,
} from './summarize'

// ── Mock OpenAI ───────────────────────────────────────────────────────────────

const mockCreate = vi.fn()
const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
} as unknown as OpenAI

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Helper ────────────────────────────────────────────────────────────────────

function makeMsg(
  role: 'user' | 'assistant' | 'system',
  content: string,
): OpenAI.Chat.ChatCompletionMessageParam {
  return { role, content }
}

function makeMessages(count: number, charsEach: number): OpenAI.Chat.ChatCompletionMessageParam[] {
  return Array.from({ length: count }, (_, i) => makeMsg(
    i % 2 === 0 ? 'user' : 'assistant',
    'a'.repeat(charsEach),
  ))
}

// ── estimateTokens ────────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns ~100 for a 400-char string', () => {
    const result = estimateTokens('a'.repeat(400))
    expect(result).toBe(100)
  })

  it('rounds up for non-divisible lengths', () => {
    // 5 chars / 4 = 1.25 → ceil = 2
    expect(estimateTokens('hello')).toBe(2)
  })
})

// ── capHistory ────────────────────────────────────────────────────────────────

describe('capHistory', () => {
  it('returns messages unchanged if under threshold', async () => {
    // 3 short messages — well under 2400 tokens
    const messages = [
      makeMsg('system', 'You are an assistant.'),
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'Hi there!'),
    ]

    const result = await capHistory(messages, mockOpenAI)

    expect(result).toEqual(messages)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls OpenAI to summarize when over SUMMARY_THRESHOLD but under HARD_CAP', async () => {
    // Need BETWEEN threshold (2400) and hard cap (3000).
    // Each 500-char message: ceil(500/4) + 4 = 129 tokens
    // System message: ceil(13/4) + 4 = 8 tokens
    // 19 non-system × 129 = 2451; total = 8 + 2451 = 2459 → over threshold, under hard cap ✓
    const messages = [
      makeMsg('system', 'System prompt'),
      ...makeMessages(19, 500),
    ]

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'This is a summary of the conversation.' } }],
    })

    const result = await capHistory(messages, mockOpenAI)

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(result.some(m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('Earlier conversation summary:'))).toBe(true)
  })

  it('preserves system messages at start of result', async () => {
    const messages = [
      makeMsg('system', 'System prompt 1'),
      makeMsg('system', 'System prompt 2'),
      ...makeMessages(19, 500),
    ]

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Summary text.' } }],
    })

    const result = await capHistory(messages, mockOpenAI)

    // System messages should appear first
    expect(result[0].role).toBe('system')
    expect(result[0].content).toBe('System prompt 1')
    expect(result[1].role).toBe('system')
    expect(result[1].content).toBe('System prompt 2')
  })

  it('falls back gracefully when summarization fails (preserves system messages, no crash)', async () => {
    // Messages between threshold (2400) and hard cap (3000): 2459 tokens
    const messages = [
      makeMsg('system', 'System prompt'),
      ...makeMessages(19, 500),
    ]

    mockCreate.mockRejectedValueOnce(new Error('OpenAI error'))

    // Should not throw
    const result = await capHistory(messages, mockOpenAI)

    // System messages must be preserved
    expect(result.some(m => m.role === 'system')).toBe(true)
    // No summary injected (summarization failed)
    expect(result.some(m =>
      m.role === 'system' &&
      typeof m.content === 'string' &&
      m.content.startsWith('Earlier conversation summary:')
    )).toBe(false)
    // Result has at least some messages
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empty history array', async () => {
    const result = await capHistory([], mockOpenAI)
    expect(result).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('truncates oldest non-system messages when over HARD_CAP', async () => {
    // Generate enough to exceed HARD_CAP_TOKENS (3000) directly
    // HARD_CAP = 3000 tokens. Each message: 1000 chars / 4 = 250 tokens + 4 overhead = 254 tokens
    // 1 system (6 tokens) + 14 × 254 = 3562 tokens → over hard cap → no summarization attempted
    const messages = [
      makeMsg('system', 'System'),
      ...makeMessages(14, 1000),
    ]

    // total > HARD_CAP so summarization block is skipped entirely — no mockCreate needed
    const result = await capHistory(messages, mockOpenAI)

    // System message must be preserved
    expect(result[0].role).toBe('system')
    // Result must fit within HARD_CAP
    const totalTokens = result.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : ''
      return sum + Math.ceil(content.length / 4) + 4
    }, 0)
    expect(totalTokens).toBeLessThanOrEqual(HARD_CAP_TOKENS)
  })

  it('prepends summary as system message before recent messages', async () => {
    const messages = [
      makeMsg('system', 'Base system'),
      ...makeMessages(19, 500),
    ]

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Conversation summary here.' } }],
    })

    const result = await capHistory(messages, mockOpenAI)

    // Find the summary message
    const summaryMsg = result.find(m =>
      m.role === 'system' &&
      typeof m.content === 'string' &&
      m.content.includes('Conversation summary here.')
    )
    expect(summaryMsg).toBeDefined()
  })
})
