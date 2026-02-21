/**
 * POST /api/agent/[boardId]/global — global board agent using OpenAI Assistants API.
 *
 * Uses threads for persistent conversation history (no board_messages writes).
 * Thread ID stored in `boards.global_agent_thread_id`.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadBoardState } from '@/lib/agent/boardState'
import { createTools, createToolContext } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAssistantsLoop, SSE_HEADERS, getOpenAI } from '@/lib/agent/sse'
import { getOrCreateThread, ensureAssistant } from '@/lib/agent/assistantsThread'
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

  const { data: member } = await supabase
    .from('board_members')
    .select('role, can_use_agents')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'manager', 'editor'].includes(member.role) || !member.can_use_agents) {
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

  const userDisplayName = getUserDisplayName(user)
  const ALLOWED_ROLES = ['owner', 'manager', 'editor', 'viewer'] as const
  const roleName = (ALLOWED_ROLES as readonly string[]).includes(member.role)
    ? member.role
    : 'member'

  // ── Load board state + thread (parallel) ──────────────────
  let boardState: Awaited<ReturnType<typeof loadBoardState>>
  let threadId: string
  try {
    [boardState, threadId] = await Promise.all([
      loadBoardState(boardId),
      getOrCreateThread(openai, boardId),
    ])
  } catch (err) {
    console.error('[api/agent/global] Failed to load board data:', err)
    return Response.json({ error: 'Failed to load board data' }, { status: 503 })
  }

  // ── Add user message to thread ────────────────────────────
  const safeDisplayName = userDisplayName.replace(/[\[\]()]/g, '')
  const prefixedMessage = `[${safeDisplayName} (${roleName})]: ${message}`

  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: prefixedMessage,
  })

  // ── Build tools ───────────────────────────────────────────
  const systemPrompt = `You are the global board assistant for a collaborative whiteboard. Multiple team members share this conversation. User messages are prefixed with [Name (role)]: to identify who sent them.

You can read and modify the board using the available tools. Be helpful to all team members and coordinate work effectively.`

  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  // Convert Chat Completions tool format to Assistants API format
  const assistantTools: Parameters<typeof ensureAssistant>[1] = toolDefinitions
    .filter((t): t is typeof t & { type: 'function' } => t.type === 'function')
    .map(t => ({
      type: 'function' as const,
      function: (t as { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } }).function,
    }))

  const assistantId = await ensureAssistant(openai, assistantTools, systemPrompt)

  // ── Stream ────────────────────────────────────────────────
  const stream = runAssistantsLoop(openai, {
    threadId,
    assistantId,
    executors,
    async onDone(_content) {
      // Thread stores messages automatically — no DB writes needed
    },
    async onError(err) {
      console.error('[api/agent/global] Stream error details:', err)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
