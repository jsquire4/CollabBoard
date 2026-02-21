/**
 * GET /api/agent/[boardId]/global/history — fetch global agent conversation history.
 *
 * Reads messages from the OpenAI thread stored in `boards.global_agent_thread_id`.
 * Returns the last 30 messages (aligned with the 20-message truncation window on runs).
 */

import { NextRequest } from 'next/server'
import type OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from '@/lib/agent/sse'
import { UUID_RE } from '@/lib/api/uuidRe'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params

  if (!UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid board ID' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  // ── Auth + thread ID (parallel) ─────────────────────────────
  const supabase = await createClient()
  const admin = createAdminClient()

  const [authResult, boardResult] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('boards').select('global_agent_thread_id').eq('id', boardId).single(),
  ])

  const { data: { user }, error: authError } = authResult
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('board_members')
    .select('role, can_use_agents')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'manager', 'editor'].includes(member.role) || !member.can_use_agents) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!boardResult.data?.global_agent_thread_id) {
    return Response.json([])
  }

  const threadId = boardResult.data.global_agent_thread_id

  try {
    const openai = getOpenAI()
    const response = await openai.beta.threads.messages.list(threadId, {
      limit: 30,
      order: 'asc',
    })

    const messages = response.data.map(msg => {
      const textContent = msg.content
        .filter((block): block is OpenAI.Beta.Threads.Messages.TextContentBlock => block.type === 'text')
        .map(block => block.text.value)
        .join('\n')

      return {
        id: msg.id,
        role: msg.role,
        content: textContent,
        created_at: new Date(msg.created_at * 1000).toISOString(),
      }
    })

    return Response.json(messages)
  } catch (err) {
    console.error('[api/agent/global/history] Failed to load history:', err)
    return Response.json([], { status: 200 })
  }
}
