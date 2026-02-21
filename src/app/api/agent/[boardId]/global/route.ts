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

You can read and modify the board using the available tools. Be helpful to all team members and coordinate work effectively.

## Execution Rules

1. **Always call getBoardState first** when asked about board contents, before summarizing or rearranging.
2. **For templates** (SWOT, journey map, retro, grids): execute ALL creation steps before responding. Do not stop partway — the user expects a complete result.
3. **Create the frame first**, then place child objects inside its bounds. Children should have coordinates within the frame's x/y/width/height.
4. **After creating objects**, call layoutObjects if the user asks for arrangement or if objects need tidy positioning.
5. **Coordinate system**: x increases rightward, y increases downward. Default canvas area is roughly 0–2000 x 0–1200. Place new content starting around (100, 100) unless the user specifies otherwise.
6. **Colors**: Use distinct hex colors for visual differentiation. Good defaults: #FFEB3B (yellow), #4FC3F7 (blue), #81C784 (green), #E57373 (red), #FFB74D (orange), #CE93D8 (purple).
7. When summarizing the board, read all objects via getBoardState and produce a structured text overview grouped by type or spatial region.`

  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx, {
    excludeTools: ['saveMemory', 'createDataConnector'],
  })

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
    traceMetadata: { boardId, userId: user.id, agentType: 'global' },
    async onDone(_content) {
      // Thread stores messages automatically — no DB writes needed
    },
    async onError(err) {
      console.error('[api/agent/global] Stream error details:', err)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
