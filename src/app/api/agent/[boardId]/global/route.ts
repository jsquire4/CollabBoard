/**
 * POST /api/agent/[boardId]/global — global board agent using Chat Completions.
 *
 * Stateless per-request: board state is injected into the user message so the
 * model can act immediately without a getBoardState round-trip. No thread or
 * assistant management — each request is fully self-contained.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { loadBoardState } from '@/lib/agent/boardState'
import { createTools, createToolContext, getToolDefinitions } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, SSE_HEADERS, getOpenAI } from '@/lib/agent/sse'
import { UUID_RE } from '@/lib/api/uuidRe'
import type { BoardObject } from '@/types/board'

export const maxDuration = 60

const GLOBAL_MODEL = 'gpt-4o-mini'

const GLOBAL_EXCLUDE = ['saveMemory', 'createDataConnector'] as const

const SYSTEM_PROMPT = `You are the board assistant for a collaborative whiteboard. Multiple team members share this conversation. User messages are prefixed with [Name (role)]: to identify who sent them.

The current board state is provided in each message inside <board_state>. Use it directly — only call getBoardState if you need to refresh after making changes.

You can read and modify the board using the available tools. Be helpful to all team members.

## Response style
- Be concise and conversational. Write like a helpful teammate, not a report generator.
- Never expose internal IDs, coordinates, or raw technical data to the user.
- Use short paragraphs or brief bullet points — not exhaustive lists of every object.
- When summarizing, describe what the board *means* (its purpose, themes, takeaways), not what it technically contains. Mention key content and structure at a high level.
- After creating or modifying objects, confirm briefly what you did in plain language (e.g. "Done — added a SWOT template with four quadrants."). Don't list every object you created.
- If there are duplicates or issues worth noting, mention them naturally — don't catalog them.

## Rules
1. Use the provided board state for content questions. Call getBoardState only to refresh after edits.
2. For templates (SWOT, journey map, retro, grids): execute ALL creation steps before responding.
3. Create the frame first, then place children inside its bounds (within the frame's x/y/width/height).
4. After creating objects, call layoutObjects if the user asks for arrangement.
5. Coordinate system: x increases right, y increases down. Canvas is roughly 0–2000 × 0–1200. Place new content starting around (100, 100) unless specified.
6. Colors: use distinct hex values. Defaults: #FFEB3B (yellow), #4FC3F7 (blue), #81C784 (green), #E57373 (red), #FFB74D (orange), #CE93D8 (purple).`

// Max chars for injected board state (~50K chars ≈ 12K tokens — covers ~600 typical objects).
// Boards beyond this are truncated so a single request never overwhelms the 200K TPM limit.
const BOARD_STATE_CHAR_LIMIT = 50_000

/**
 * Serialize board objects into a compact JSON array for prompt injection.
 * Returns the serialized string and whether it was truncated.
 */
function serializeBoardState(objects: Map<string, BoardObject>): { json: string; truncated: boolean } {
  const items = Array.from(objects.values())
    .filter(obj => !obj.deleted_at)
    .map(obj => ({
      id: obj.id,
      type: obj.type,
      x: Math.round(obj.x),
      y: Math.round(obj.y),
      width: obj.width,
      height: obj.height,
      ...(obj.text ? { text: obj.text } : {}),
      ...(obj.title ? { title: obj.title } : {}),
      color: obj.color,
      ...(obj.parent_id ? { parent_id: obj.parent_id } : {}),
    }))

  const full = JSON.stringify(items)
  if (full.length <= BOARD_STATE_CHAR_LIMIT) {
    return { json: full, truncated: false }
  }

  // Binary-search for the largest prefix that fits within the char limit
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (JSON.stringify(items.slice(0, mid)).length <= BOARD_STATE_CHAR_LIMIT) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return { json: JSON.stringify(items.slice(0, lo)), truncated: true }
}

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

  const member = await requireBoardMember(supabase, boardId, user.id, {
    allowedRoles: ['owner', 'manager', 'editor'],
    requireAgents: true,
  })
  if (!member) {
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

  // ── Load board state ──────────────────────────────────────
  let boardState: Awaited<ReturnType<typeof loadBoardState>>
  try {
    boardState = await loadBoardState(boardId)
  } catch (err) {
    console.error('[api/agent/global] Failed to load board data:', err)
    return Response.json({ error: 'Failed to load board data' }, { status: 503 })
  }

  // ── Build user message with injected board state ──────────
  const safeDisplayName = getUserDisplayName(user).replace(/[\[\]()]/g, '')
  const ALLOWED_ROLES = ['owner', 'manager', 'editor', 'viewer'] as const
  const roleName = (ALLOWED_ROLES as readonly string[]).includes(member.role)
    ? member.role
    : 'member'

  const { json: stateJson, truncated } = serializeBoardState(boardState.objects)
  const truncationNote = truncated ? ' (truncated — call getBoardState to see all objects)' : ''
  const userContent = stateJson !== '[]'
    ? `[${safeDisplayName} (${roleName})]: ${message}\n\n<board_state${truncationNote}>${stateJson}</board_state>`
    : `[${safeDisplayName} (${roleName})]: ${message}`

  // ── Build tools + executors ───────────────────────────────
  const toolDefinitions = getToolDefinitions([...GLOBAL_EXCLUDE])
  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { executors } = createTools(toolCtx, { excludeTools: [...GLOBAL_EXCLUDE] })

  // ── Stream ────────────────────────────────────────────────
  const stream = runAgentLoop(openai, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    tools: toolDefinitions,
    model: GLOBAL_MODEL,
    executors,
    parallelToolCalls: false,
    traceMetadata: { boardId, userId: user.id, agentType: 'global' },
    async onMessage(_msg) {
      // Ephemeral — no persistence
    },
    async onToolResult(_name, _result) {
      // Tool results are visible in the SSE stream
    },
    async onDone(_content, _toolCalls) {
      // No-op
    },
    async onError(err) {
      console.error('[api/agent/global] Stream error details:', err)
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
