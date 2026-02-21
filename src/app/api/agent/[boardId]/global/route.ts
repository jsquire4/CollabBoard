/**
 * POST /api/agent/[boardId]/global — global board agent using Chat Completions.
 *
 * Unlike per-agent routes, this is scoped to the whole board (agent_object_id IS NULL).
 * Message prefix: "[Alice (editor)]: message" for multi-user attribution.
 * The global_agent_thread_id column is reserved for a future Assistants API upgrade.
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState } from '@/lib/agent/boardState'
import { createTools, createToolContext } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, SSE_HEADERS } from '@/lib/agent/sse'
import { capHistory } from '@/lib/agent/summarize'
import { UUID_RE } from '@/lib/api/uuidRe'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(
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

  if (!member || !['owner', 'editor'].includes(member.role) || !member.can_use_agents) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const userDisplayName = getUserDisplayName(user)
  // Allowlist role values before embedding in the prefix sent to OpenAI
  const ALLOWED_ROLES = ['owner', 'editor', 'viewer'] as const
  const roleName = (ALLOWED_ROLES as readonly string[]).includes(member.role)
    ? member.role
    : 'member'

  // ── Load board state + history (parallel) ────────────────
  let boardState: Awaited<ReturnType<typeof loadBoardState>>
  let historyResult: { data: { role: string; content: string; user_display_name: string | null }[] | null; error: unknown }
  try {
    [boardState, historyResult] = await Promise.all([
      loadBoardState(boardId),
      admin
        .from('board_messages')
        .select('role, content, user_display_name')
        .eq('board_id', boardId)
        .is('agent_object_id', null)
        .order('created_at', { ascending: true })
        .limit(20),
    ])
  } catch (err) {
    console.error('[api/agent/global] Failed to load board data:', err)
    return Response.json({ error: 'Failed to load board data' }, { status: 503 })
  }

  if (historyResult.error) {
    console.error('[api/agent/global] Failed to load history:', historyResult.error)
  }

  const history = (historyResult.data ?? []) as { role: string; content: string; user_display_name: string | null }[]

  // ── Persist user message ──────────────────────────────────
  const safeDisplayName = userDisplayName.replace(/[\[\]()]/g, '')
  const prefixedMessage = `[${safeDisplayName} (${roleName})]: ${message}`

  await admin.from('board_messages').insert({
    board_id: boardId,
    agent_object_id: null,
    role: 'user',
    content: prefixedMessage,
    user_id: user.id,
    user_display_name: userDisplayName,
  })

  const systemPrompt = `You are the global board assistant for a collaborative whiteboard. Multiple team members share this conversation. User messages are prefixed with [Name (role)]: to identify who sent them.

You can read and modify the board using the available tools. Be helpful to all team members and coordinate work effectively.`

  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  const rawMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: prefixedMessage },
  ]

  // Apply token cap before sending to OpenAI
  const messages = await capHistory(rawMessages, openai)

  // ── Stream ────────────────────────────────────────────────
  const stream = runAgentLoop(openai, {
    messages,
    tools: toolDefinitions,
    model: 'gpt-4o',
    executors,
    async onMessage(_msg) {
      // Intermediate tool-call steps are not persisted individually
    },
    async onToolResult(_name, _result) {
      // Tool results are visible in SSE stream; no separate persistence needed
    },
    async onDone(content, toolCalls) {
      if (content) {
        await admin.from('board_messages').insert({
          board_id: boardId,
          agent_object_id: null,
          role: 'assistant',
          content,
          tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
        })
      }
    },
    async onError(err) {
      console.error('[api/agent/global] Stream error details:', err)
      // No agent_state to update for global route
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
