/**
 * OpenAI Assistants API helpers for the global board agent.
 *
 * - Thread lifecycle: one thread per board, stored in `boards.global_agent_thread_id`
 * - Assistant lifecycle: module-level cache, created once per process
 */

import type OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Thread management ────────────────────────────────────────────────────────

/**
 * Get or create an OpenAI thread for the given board.
 * Reads `boards.global_agent_thread_id`; if null, creates a new thread and stores the ID.
 */
export async function getOrCreateThread(
  openai: OpenAI,
  boardId: string,
): Promise<string> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('boards')
    .select('global_agent_thread_id')
    .eq('id', boardId)
    .single()

  if (error) throw new Error(`Failed to load board: ${error.message}`)

  if (data.global_agent_thread_id) {
    return data.global_agent_thread_id
  }

  // Create a new thread
  const thread = await openai.beta.threads.create()

  // Use a conditional update to avoid race: only write if still null.
  // If another request already wrote a thread ID, use theirs.
  const { data: updated, error: updateError } = await admin
    .from('boards')
    .update({ global_agent_thread_id: thread.id })
    .eq('id', boardId)
    .is('global_agent_thread_id', null)
    .select('global_agent_thread_id')
    .maybeSingle()

  if (updateError) {
    console.error('[assistantsThread] Failed to store thread ID:', updateError)
  }

  // If the conditional update didn't match (another request won the race),
  // re-read the winning thread ID and use it instead
  if (!updated) {
    const { data: reread } = await admin
      .from('boards')
      .select('global_agent_thread_id')
      .eq('id', boardId)
      .single()
    if (reread?.global_agent_thread_id) {
      return reread.global_agent_thread_id
    }
  }

  return thread.id
}

// ── Assistant management ─────────────────────────────────────────────────────

let _cachedAssistantId: string | null = null

const ASSISTANT_NAME = 'CollabBoard Global Agent'

/**
 * Get or create an OpenAI Assistant for the global board agent.
 * Cached at module level to avoid re-creating per request.
 * On cold start, searches for an existing assistant by name before creating a new one.
 */
export async function ensureAssistant(
  openai: OpenAI,
  tools: OpenAI.Beta.Assistants.AssistantTool[],
  systemPrompt: string,
): Promise<string> {
  if (_cachedAssistantId) {
    return _cachedAssistantId
  }

  // Search for existing assistant by name to avoid orphans on cold starts
  const existing = await openai.beta.assistants.list({ limit: 100 })
  const found = existing.data.find(a => a.name === ASSISTANT_NAME)
  if (found) {
    // Update tools and instructions in case they changed
    await openai.beta.assistants.update(found.id, {
      instructions: systemPrompt,
      tools,
    })
    _cachedAssistantId = found.id
    return found.id
  }

  const assistant = await openai.beta.assistants.create({
    name: ASSISTANT_NAME,
    instructions: systemPrompt,
    model: 'gpt-4o',
    tools,
  })

  _cachedAssistantId = assistant.id
  return assistant.id
}
