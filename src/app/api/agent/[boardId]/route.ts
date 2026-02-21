/**
 * POST /api/agent/[boardId] — per-agent Chat Completions streaming.
 *
 * Ephemeral chat: no DB history. The agent persists memory via saveMemory tool
 * (creates context_object + data_connector on the board).
 * Visibility is scoped to objects connected via data_connector edges.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState } from '@/lib/agent/boardState'
import { resolveConnectionGraph } from '@/lib/agent/contextResolver'
import { createTools, createToolContext } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, SSE_HEADERS, getOpenAI } from '@/lib/agent/sse'
import { UUID_RE } from '@/lib/api/uuidRe'

export const maxDuration = 60

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

  const openai = getOpenAI()

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

  if (!member || !['owner', 'manager', 'editor'].includes(member.role) || !member.can_use_agents) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { message?: string; agentObjectId?: string; viewportCenter?: { x: number; y: number } }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, agentObjectId, viewportCenter } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }
  if (!agentObjectId || !UUID_RE.test(agentObjectId)) {
    return Response.json({ error: 'agentObjectId is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const userDisplayName = getUserDisplayName(user)

  // ── Load board state ────────────────────────────────────
  let boardState: Awaited<ReturnType<typeof loadBoardState>>
  try {
    boardState = await loadBoardState(boardId)
  } catch (err) {
    console.error('[api/agent] Failed to load board data:', err)
    return Response.json({ error: 'Failed to load board data' }, { status: 503 })
  }

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

  const validViewport = viewportCenter
    && typeof viewportCenter.x === 'number' && typeof viewportCenter.y === 'number'
    && Number.isFinite(viewportCenter.x) && Number.isFinite(viewportCenter.y)
  const viewportHint = validViewport
    ? `\n\nThe user's viewport is centered at approximately (${Math.round(viewportCenter.x)}, ${Math.round(viewportCenter.y)}).`
    : ''

  const systemPrompt = `You are ${agentName}, an AI assistant embedded on a collaborative whiteboard. The user talking to you is ${userDisplayName}.

You can only see and edit objects that are connected to you via data connectors. Use getConnectedObjects to see what's in your scope.
${contextBlock}${viewportHint}

Guidelines:
- Be concise and helpful. Use tools proactively when the user asks you to create or modify things.
- When creating multiple related objects, batch them logically.
- Always confirm what you created or changed in your final response.
- If a tool returns an error, explain the issue and suggest alternatives.
- Use saveMemory to persist important information — your chat history is not saved between sessions.
- Use createDataConnector to add existing board objects to your visibility scope.`

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

  // ── Build messages + tools ────────────────────────────────
  const toolCtx = createToolContext(boardId, user.id, boardState, agentObjectId)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: message },
  ]

  // ── Stream ────────────────────────────────────────────────
  const stream = runAgentLoop(openai, {
    messages,
    tools: toolDefinitions,
    model: agentModel,
    executors,
    traceMetadata: { boardId, userId: user.id, agentType: 'per-agent' },
    async onMessage(_msg) {
      // Ephemeral — no persistence
    },
    async onToolResult(_name, _result) {
      // Tool results are visible in SSE stream
    },
    async onDone(_content, _toolCalls) {
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
