/**
 * GET /api/agent/[boardId]/global/history — fetch global agent conversation history.
 *
 * Reads messages from the OpenAI thread stored in `boards.global_agent_thread_id`.
 * Falls back to empty array if no thread exists yet.
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

  // ── Auth ──────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
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

  const openai = getOpenAI()

  try {
    // Read-only: don't create a thread as a side effect of fetching history
    const admin = createAdminClient()
    const { data: board } = await admin
      .from('boards')
      .select('global_agent_thread_id')
      .eq('id', boardId)
      .single()

    if (!board?.global_agent_thread_id) {
      return Response.json([])
    }

    const threadId = board.global_agent_thread_id

    const response = await openai.beta.threads.messages.list(threadId, {
      limit: 50,
      order: 'asc',
    })

    const messages = response.data.map(msg => {
      // Extract text content from message content blocks
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
