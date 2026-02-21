/**
 * POST /api/agent/[boardId] — direct OpenAI Chat Completions streaming.
 * Replaced Fly.io proxy in Phase 2.
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState } from '@/lib/agent/boardState'
import { resolveConnectionGraph } from '@/lib/agent/contextResolver'
import { createTools, createToolContext } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, sseEvent, SSE_HEADERS } from '@/lib/agent/sse'
import { capHistory } from '@/lib/agent/summarize'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // ── Board membership + can_use_agents ────────────────────
  const { data: member } = await supabase
    .from('board_members')
    .select('role, can_use_agents')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role) || !member.can_use_agents) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { message?: string; agentObjectId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, agentObjectId } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }
  if (!agentObjectId || !UUID_RE.test(agentObjectId)) {
    return Response.json({ error: 'agentObjectId is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const userDisplayName = getUserDisplayName(user)

  // ── Parallel data loading ─────────────────────────────────
  let boardState: Awaited<ReturnType<typeof loadBoardState>>
  let historyResult: { data: { role: string; content: string }[] | null; error: unknown }
  try {
    [boardState, historyResult] = await Promise.all([
      loadBoardState(boardId),
      admin
        .from('board_messages')
        .select('role, content')
        .eq('board_id', boardId)
        .eq('agent_object_id', agentObjectId)
        .order('created_at', { ascending: true })
        .limit(20),
    ])
  } catch (err) {
    console.error('[api/agent] Failed to load board data:', err)
    return Response.json({ error: 'Failed to load board data' }, { status: 503 })
  }

  if (historyResult.error) {
    console.error('[api/agent] Failed to load history:', historyResult.error)
  }

  const history = (historyResult.data ?? []) as { role: string; content: string }[]

  const agentObj = boardState.objects.get(agentObjectId)
  if (!agentObj || agentObj.board_id !== boardId) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }
  const agentModel = agentObj.model ?? 'gpt-4o'
  const agentName = agentObj.text || 'Board Agent'

  // ── Context injection ─────────────────────────────────────
  const connectedObjects = resolveConnectionGraph(boardState, agentObjectId)
  const contextBlock = connectedObjects.length > 0
    ? `\n\nConnected context objects:\n${JSON.stringify(connectedObjects, null, 2)}`
    : ''

  const systemPrompt = `You are ${agentName}, an AI assistant embedded on a collaborative whiteboard. You can read and modify the board using the tools provided.
${contextBlock}

Guidelines:
- Be concise and helpful. Use tools proactively when the user asks you to create or modify things.
- When creating multiple related objects, batch them logically.
- Always confirm what you created or changed in your final response.
- If a tool returns an error, explain the issue and suggest alternatives.`

  // ── Set agent_state to thinking ───────────────────────────
  await admin
    .from('board_objects')
    .update({ agent_state: 'thinking' })
    .eq('id', agentObjectId)
    .eq('board_id', boardId)
    .is('deleted_at', null)

  // ── Client disconnect handler ─────────────────────────────
  request.signal.addEventListener('abort', () => {
    void admin
      .from('board_objects')
      .update({ agent_state: 'idle' })
      .eq('id', agentObjectId)
      .eq('board_id', boardId)
      .is('deleted_at', null)
  })

  // ── Persist user message ──────────────────────────────────
  await admin.from('board_messages').insert({
    board_id: boardId,
    agent_object_id: agentObjectId,
    role: 'user',
    content: message,
    user_id: user.id,
    user_display_name: userDisplayName,
  })

  // ── Build messages + tools ────────────────────────────────
  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  const rawMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]

  // Apply token cap before sending to OpenAI
  const messages = await capHistory(rawMessages, openai)

  // ── Stream ────────────────────────────────────────────────
  const stream = runAgentLoop(openai, {
    messages,
    tools: toolDefinitions,
    model: agentModel,
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
          agent_object_id: agentObjectId,
          role: 'assistant',
          content,
          tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
        })
      }

      await admin
        .from('board_objects')
        .update({ agent_state: 'done' })
        .eq('id', agentObjectId)
        .eq('board_id', boardId)
        .is('deleted_at', null)
    },
    async onError(err) {
      console.error('[api/agent] Stream error details:', err)
      try {
        await admin
          .from('board_objects')
          .update({ agent_state: 'error' })
          .eq('id', agentObjectId)
          .eq('board_id', boardId)
          .is('deleted_at', null)
      } catch { /* best effort */ }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
