/**
 * POST /api/agent/[boardId]/global — global board agent using Chat Completions.
 *
 * Stateless per-request: board state is injected into the user message so the
 * model can act immediately without a getBoardState round-trip. No thread or
 * assistant management — each request is fully self-contained.
 */

import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { loadBoardState } from '@/lib/agent/boardState'
import { precomputePlacements, formatPrecomputedPlacements } from '@/lib/agent/precomputePlacements'
import { createTools, createToolContext, getToolDefinitions } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, SSE_HEADERS, getOpenAI } from '@/lib/agent/sse'
import { UUID_RE } from '@/lib/api/uuidRe'
import type { BoardObject } from '@/types/board'

export const maxDuration = 60

const GLOBAL_MODEL = 'gpt-4o-mini'

const GLOBAL_EXCLUDE = ['saveMemory', 'createDataConnector'] as const

/** Maps quick action IDs to tool names. When set, only these tools are loaded to reduce context. */
const QUICK_ACTION_TOOL_GROUPS: Record<string, string[]> = {
  sticky: ['createStickyNote', 'precomputePlacements', 'moveObject'],
  rectangle: ['createShape', 'precomputePlacements', 'moveObject'],
  frame: ['createFrame', 'precomputePlacements', 'moveObject'],
  table: ['createTable', 'precomputePlacements', 'moveObject'],
  grid: ['layoutObjects', 'getBoardState'],
  horizontal: ['layoutObjects', 'getBoardState'],
  vertical: ['layoutObjects', 'getBoardState'],
  circle: ['layoutObjects', 'getBoardState'],
  swot: ['createFrame', 'createShape', 'createStickyNote', 'precomputePlacements', 'moveObject'],
  journey: ['createFrame', 'createShape', 'createStickyNote', 'precomputePlacements', 'moveObject'],
  retro: ['createFrame', 'createStickyNote', 'precomputePlacements', 'moveObject'],
  'sticky-grid': ['createFrame', 'createStickyNote', 'precomputePlacements', 'moveObject'],
  'color-all': ['getBoardState', 'changeColor'],
  'delete-empty': ['getBoardState', 'deleteObject'],
  duplicate: ['getBoardState', 'duplicateObject'],
  group: ['getBoardState', 'groupObjects'],
  ungroup: ['getBoardState', 'ungroupObjects'],
  'bring-front': ['getBoardState', 'updateZIndex'],
  'send-back': ['getBoardState', 'updateZIndex'],
  'read-table': ['getBoardState', 'getTableData'],
  'add-table-row': ['getBoardState', 'addTableRow'],
  'update-table-cell': ['getBoardState', 'getTableData', 'updateTableCell'],
  summarize: ['getBoardState'],
  'describe-image': ['getBoardState', 'describeImage'],
}

/** Tools available when user has selection (no quickActionId). Includes table tools for table selection. */
const SELECTION_TOOLS = [
  'layoutObjects',
  'groupObjects',
  'ungroupObjects',
  'updateZIndex',
  'getBoardState',
  'moveObject',
  'changeColor',
  'duplicateObject',
  'deleteObject',
  'getTableData',
  'updateTableCell',
  'updateTableHeader',
  'addTableRow',
  'deleteTableRow',
  'addTableColumn',
  'deleteTableColumn',
] as const

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

## Queue awareness
When the user has multiple requests queued (you'll see [Note: The user has N more request(s) queued...]), you may briefly ask: "I see you have a few things queued — want me to tackle these as a structured plan, or run them one by one?" Or just proceed if the intent is clear (e.g. several quick actions). Keep it short.

## Multi-action requests (2+ quick actions in one message)
When the user sends multiple quick actions in a single message, STOP before executing. Assess whether the combination makes sense — random mixes (SWOT + Add Frame + Arrange Circle with no selection) often mean the user added things by accident. Ask a clarifying question if unsure. Only execute when confident.

## Rules
1. Use the provided board state for content questions. Call getBoardState only to refresh after edits.
2. When <precomputed_placements> is present, use those coordinates directly. If the user clarifies the request (e.g. "just one SWOT"), call precomputePlacements with the updated quickActionIds to get fresh placements, then create using those. Match Placement N to the Nth template/creation.
3. For templates (SWOT, journey map, retro, grids): execute ALL creation steps before responding.
4. Create the frame first, then place children inside its bounds (within the frame's x/y/width/height).
5. After creating objects, call layoutObjects if the user asks for arrangement.
6. Coordinate system: x increases right, y increases down. Canvas is roughly 0–2000 × 0–1200. Place new content starting around (100, 100) unless specified.
7. Colors: use distinct hex values. Defaults: #FFEB3B (yellow), #4FC3F7 (blue), #81C784 (green), #E57373 (red), #FFB74D (orange), #CE93D8 (purple).

## Board state format (compact keys in <board_state>)
Keys: i=id, t=type, x,y,w=width,h=height,txt=text,ttl=title,c=color,p=parent_id. Full content via getBoardState.`

// Max chars for injected board state (~50K chars ≈ 12K tokens — covers ~600 typical objects).
// Boards beyond this are truncated so a single request never overwhelms the 200K TPM limit.
const BOARD_STATE_CHAR_LIMIT = 50_000
const TEXT_TRUNCATE_LEN = 100
const DEFAULT_COLOR = '#FFEB3B'
const MAX_MESSAGE_LENGTH = 10_000
const MAX_HISTORY_ENTRY_LENGTH = 2_000
const MAX_QUICK_ACTION_IDS = 20

const VIEWPORT_RADIUS = 500 // Objects within this distance of viewport center get priority

/**
 * Priority for truncation: viewport > frames/groups > text-rich > rest.
 * Higher score = included first when truncating.
 */
function truncationPriority(obj: BoardObject, viewportCenter?: { x: number; y: number }): number {
  let score = 0
  const cx = (obj.x ?? 0) + (obj.width ?? 0) / 2
  const cy = (obj.y ?? 0) + (obj.height ?? 0) / 2
  if (viewportCenter) {
    const dx = cx - viewportCenter.x
    const dy = cy - viewportCenter.y
    if (dx * dx + dy * dy < VIEWPORT_RADIUS * VIEWPORT_RADIUS) score += 1000
  }
  if (obj.type === 'frame' || obj.type === 'group') score += 100
  const textRich = ['sticky_note', 'table'].includes(obj.type) || !!(obj.text || obj.title)
  if (textRich) score += 10
  return score
}

/**
 * When selectedIds is provided, filter to selected objects plus their parent frames.
 */
function filterToSelection(
  objects: Map<string, BoardObject>,
  selectedIds: string[],
): Map<string, BoardObject> {
  const selectedSet = new Set(selectedIds)
  const result = new Map<string, BoardObject>()
  const includeId = (id: string) => {
    const obj = objects.get(id)
    if (!obj || obj.deleted_at) return
    if (result.has(id)) return
    result.set(id, obj)
    if (obj.parent_id) includeId(obj.parent_id)
  }
  for (const id of selectedSet) {
    includeId(id)
  }
  return result
}

/**
 * Serialize board objects into a compact JSON array for prompt injection.
 * Uses shorthand keys to reduce tokens. When selectedIds provided, only selected + parent frames.
 * When truncating, prefers viewport objects, frames, and text-rich objects.
 */
function serializeBoardState(
  objects: Map<string, BoardObject>,
  viewportCenter?: { x: number; y: number },
  selectedIds?: string[],
): { json: string; truncated: boolean } {
  const source =
    selectedIds && selectedIds.length > 0 ? filterToSelection(objects, selectedIds) : objects
  const objs = Array.from(source.values()).filter(obj => !obj.deleted_at)
  const items = objs.map(obj => {
    const base: Record<string, unknown> = {
      i: obj.id,
      t: obj.type,
      x: Math.round(obj.x),
      y: Math.round(obj.y),
      w: obj.width,
      h: obj.height,
    }
    if (obj.text) base.txt = obj.text.length > TEXT_TRUNCATE_LEN ? obj.text.slice(0, TEXT_TRUNCATE_LEN) + '…' : obj.text
    if (obj.title) base.ttl = obj.title.length > TEXT_TRUNCATE_LEN ? obj.title.slice(0, TEXT_TRUNCATE_LEN) + '…' : obj.title
    if (obj.color && obj.color !== DEFAULT_COLOR) base.c = obj.color
    if (obj.parent_id) base.p = obj.parent_id
    return { obj, base } as { obj: BoardObject; base: Record<string, unknown> }
  })

  const full = JSON.stringify(items.map(i => i.base))
  if (full.length <= BOARD_STATE_CHAR_LIMIT) {
    return { json: full, truncated: false }
  }

  // Sort by priority (highest first), then take largest prefix that fits
  items.sort((a, b) => truncationPriority(b.obj, viewportCenter) - truncationPriority(a.obj, viewportCenter))
  const bases = items.map(i => i.base)
  let lo = 0
  let hi = bases.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (JSON.stringify(bases.slice(0, mid)).length <= BOARD_STATE_CHAR_LIMIT) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return { json: JSON.stringify(bases.slice(0, lo)), truncated: true }
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

  let body: {
    message?: string
    viewportCenter?: { x: number; y: number }
    quickActionId?: string
    quickActionIds?: string[]
    selectedIds?: string[]
    queuedPreviews?: string[]
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, viewportCenter, quickActionId, quickActionIds, selectedIds, queuedPreviews, conversationHistory } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: `message exceeds ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 })
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
  const validViewport = viewportCenter
    && typeof viewportCenter.x === 'number' && typeof viewportCenter.y === 'number'
    && Number.isFinite(viewportCenter.x) && Number.isFinite(viewportCenter.y)
  const safeDisplayName = getUserDisplayName(user).replace(/[\[\]()<>{}\x00-\x1f\n\r]/g, '').slice(0, 100)
  const ALLOWED_ROLES = ['owner', 'manager', 'editor', 'viewer'] as const
  const roleName = (ALLOWED_ROLES as readonly string[]).includes(member.role)
    ? member.role
    : 'member'

  const validSelectedIds =
    Array.isArray(selectedIds) && selectedIds.length > 0
      ? selectedIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
      : undefined

  const validConversationHistory =
    Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? conversationHistory
          .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
          )
          .slice(-20)
          .map(m => ({
            ...m,
            content: m.content
              .replace(/[\[\]<>{}]/g, '')
              .replace(/[\x00-\x1f]/g, '')
              .slice(0, MAX_HISTORY_ENTRY_LENGTH),
          }))
      : []

  const { json: stateJson, truncated } = serializeBoardState(
    boardState.objects,
    validViewport ? viewportCenter : undefined,
    validSelectedIds,
  )
  const truncationNote = truncated ? ' (truncated — call getBoardState to see all objects)' : ''
  const selectionHint =
    validSelectedIds && validSelectedIds.length > 0
      ? `[Selection: ${validSelectedIds.length} objects — ${validSelectedIds.join(',')}. Use these IDs for layoutObjects, groupObjects, updateZIndex.]\n\n`
      : ''
  const validQueuedPreviews =
    Array.isArray(queuedPreviews) && queuedPreviews.length > 0
      ? queuedPreviews
          .filter((p): p is string => typeof p === 'string')
          .slice(0, 10)
          .map(p => p.replace(/[\[\]<>{}]/g, '').replace(/[\x00-\x1f]/g, '').slice(0, 200))
      : []
  const queueHint =
    validQueuedPreviews.length > 0
      ? `[Note: The user has ${validQueuedPreviews.length} more request(s) queued after this one: ${validQueuedPreviews.join('; ')}. You may briefly ask if they want a structured plan or to process sequentially — or just proceed if the intent is clear. Keep it short.]\n\n`
      : ''

  // ── Build tools + executors ───────────────────────────────
  const validQuickActionIds = Array.isArray(quickActionIds) && quickActionIds.length > 0
    ? quickActionIds
        .filter((id): id is string => typeof id === 'string' && id in QUICK_ACTION_TOOL_GROUPS)
        .slice(0, MAX_QUICK_ACTION_IDS)
    : quickActionId && typeof quickActionId === 'string' && quickActionId in QUICK_ACTION_TOOL_GROUPS
      ? [quickActionId]
      : []
  const placements = precomputePlacements(
    boardState.objects,
    validQuickActionIds,
    validViewport ? viewportCenter : undefined,
  )
  const precomputedBlock = placements.length > 0 ? `\n\n${formatPrecomputedPlacements(placements)}` : ''
  const userContent = stateJson !== '[]'
    ? `[${safeDisplayName} (${roleName})]: ${selectionHint}${queueHint}${message}${precomputedBlock}\n\n<board_state${truncationNote}>${stateJson}</board_state>`
    : `[${safeDisplayName} (${roleName})]: ${selectionHint}${queueHint}${message}${precomputedBlock}`

  const quickActionTools =
    validQuickActionIds.length > 0
      ? [...new Set(validQuickActionIds.flatMap(id => QUICK_ACTION_TOOL_GROUPS[id] ?? []))]
      : validConversationHistory.length > 0
        ? [...new Set(['swot', 'journey', 'retro', 'sticky-grid', 'sticky', 'frame', 'rectangle', 'table'].flatMap(id => QUICK_ACTION_TOOL_GROUPS[id] ?? []))]
        : undefined
  const selectionTools =
    validSelectedIds && validSelectedIds.length > 0 ? [...SELECTION_TOOLS] : undefined
  const includeTools =
    quickActionTools && selectionTools
      ? [...new Set([...quickActionTools, ...selectionTools])]
      : quickActionTools ?? selectionTools
  const excludeTools = [...GLOBAL_EXCLUDE]
  const toolDefinitions = getToolDefinitions({
    excludeTools,
    ...(includeTools ? { includeTools } : {}),
  })
  const toolCtx = createToolContext(
    boardId,
    user.id,
    boardState,
    undefined,
    validViewport ? viewportCenter : undefined,
  )
  const { executors } = createTools(toolCtx, {
    excludeTools,
    ...(includeTools ? { includeTools } : {}),
  })

  // ── Stream ────────────────────────────────────────────────
  const historyMessages = validConversationHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  const stream = runAgentLoop(openai, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
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
