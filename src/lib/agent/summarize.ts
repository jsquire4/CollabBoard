/**
 * Token estimation and history summarization for agent routes.
 * Prevents context window overflow without silently dropping messages.
 */

import type OpenAI from 'openai'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Characters per token estimate (rough heuristic for English text). */
const CHAR_PER_TOKEN = 4

/** Hard token cap — above this we MUST truncate. ~12,000 chars */
export const HARD_CAP_TOKENS = 3_000

/** Summarization threshold — 80% of cap triggers an OpenAI summary call. */
export const SUMMARY_THRESHOLD_TOKENS = 2_400

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Rough token estimate for a single string.
 * Uses char-count heuristic: 1 token ≈ 4 characters.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHAR_PER_TOKEN)
}

function messageTokens(msg: OpenAI.Chat.ChatCompletionMessageParam): number {
  const content = typeof msg.content === 'string' ? msg.content : ''
  return estimateTokens(content) + 4 // ~4 tokens overhead per message
}

function totalTokens(messages: OpenAI.Chat.ChatCompletionMessageParam[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Cap the message history to stay within token limits.
 *
 * Behaviour:
 * 1. Under SUMMARY_THRESHOLD → return messages unchanged.
 * 2. At/over SUMMARY_THRESHOLD, under HARD_CAP → call OpenAI to summarize the
 *    oldest non-system messages, then prepend summary as a system message.
 * 3. At/over HARD_CAP → drop oldest non-system messages until under limit,
 *    without an OpenAI call.
 * 4. If the summarization call fails → fall back to drop-oldest truncation.
 *
 * System messages are always preserved at the start of the array.
 */
export async function capHistory(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  openai: OpenAI,
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const total = totalTokens(messages)

  if (total < SUMMARY_THRESHOLD_TOKENS) {
    return messages
  }

  // Separate system messages from the rest
  const systemMessages = messages.filter(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  if (total < HARD_CAP_TOKENS) {
    // Try to summarize via OpenAI
    try {
      const toSummarize = nonSystemMessages.slice(0, -4) // keep last 4 exchanges
      if (toSummarize.length === 0) return messages

      const summaryPrompt = toSummarize
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
        .join('\n')

      const summaryRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Summarize the following conversation history concisely, preserving key decisions, tool calls made, and objects created or modified. Keep it under 200 words.',
          },
          { role: 'user', content: summaryPrompt },
        ],
        max_tokens: 300,
        stream: false,
      })

      const summaryText = summaryRes.choices[0]?.message?.content ?? ''
      const recentMessages = nonSystemMessages.slice(-4)

      return [
        ...systemMessages,
        { role: 'system', content: `Earlier conversation summary: ${summaryText}` },
        ...recentMessages,
      ]
    } catch (err) {
      console.warn('[summarize] Summarization failed, falling back to truncation:', err)
      // Fall through to drop-oldest truncation
    }
  }

  // Drop-oldest truncation: keep system messages + enough recent messages under HARD_CAP
  const systemTokens = systemMessages.reduce((sum, m) => sum + messageTokens(m), 0)
  let budget = HARD_CAP_TOKENS - systemTokens
  const kept: OpenAI.Chat.ChatCompletionMessageParam[] = []

  // Walk from newest to oldest
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const cost = messageTokens(nonSystemMessages[i])
    if (budget - cost < 0) break
    budget -= cost
    kept.unshift(nonSystemMessages[i])
  }

  return [...systemMessages, ...kept]
}
