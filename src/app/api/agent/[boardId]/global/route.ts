/**
 * POST /api/agent/[boardId]/global — global board agent using Chat Completions.
 *
 * Three-tier execution:
 *   - direct:        Deterministic ops (layout, z-order, group, duplicate). No LLM call.
 *   - simple-create: Deterministic creation with placement. No LLM call.
 *   - llm:           Requires LLM reasoning (templates, recolor, summarize, etc.).
 *
 * When all actions are direct/simple-create, the response is a synthetic SSE stream
 * with a canned confirmation — no OpenAI API call at all.
 */

import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { loadBoardState } from '@/lib/agent/boardState'
import { precomputePlacements, formatPrecomputedPlacements } from '@/lib/agent/precomputePlacements'
import { createTools, createToolContext, getToolDefinitions } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'
import { runAgentLoop, SSE_HEADERS, sseEvent, getOpenAI } from '@/lib/agent/sse'
import { UUID_RE } from '@/lib/api/uuidRe'
import { ACTION_MAP, QUICK_ACTION_TOOL_GROUPS } from '@/lib/agent/actionRegistry'
import type { ActionDef } from '@/lib/agent/actionRegistry'
import type { BoardObject } from '@/types/board'

export const maxDuration = 60

const GLOBAL_MODEL = 'gpt-4o-mini'

const GLOBAL_EXCLUDE = ['saveMemory', 'createDataConnector'] as const

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

## Multi-action requests
When the user sends multiple actions in a single message:
1. Execute them in the order listed. Each action is numbered.
2. If an action requires objects that don't exist yet, skip it and note why.
3. If two actions contradict (e.g. arrange horizontally AND vertically), use the last one.
4. Brief confirmation at the end listing what was done.

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
    if (obj.text) base.txt = obj.text.length > TEXT_TRUNCATE_LEN ? obj.text.slice(0, TEXT_TRUNCATE_LEN) + '...' : obj.text
    if (obj.title) base.ttl = obj.title.length > TEXT_TRUNCATE_LEN ? obj.title.slice(0, TEXT_TRUNCATE_LEN) + '...' : obj.title
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

// ── Direct execution helpers ────────────────────────────────────────────────

/** Layout action ID → layoutObjects layout arg */
const LAYOUT_MAP: Record<string, string> = {
  grid: 'grid',
  horizontal: 'horizontal',
  vertical: 'vertical',
  circle: 'circle',
}

/** Simple-create action ID → tool name + args builder */
const SIMPLE_CREATE_MAP: Record<string, { tool: string; args: (placement: { x: number; y: number }) => Record<string, unknown> }> = {
  sticky: { tool: 'createStickyNote', args: (p) => ({ x: p.x, y: p.y }) },
  rectangle: { tool: 'createShape', args: (p) => ({ type: 'rectangle', x: p.x, y: p.y }) },
  frame: { tool: 'createFrame', args: (p) => ({ x: p.x, y: p.y }) },
  table: { tool: 'createTable', args: (p) => ({ x: p.x, y: p.y, columns: 3, rows: 3 }) },
}

interface DirectResult {
  results: string[]
  failed: string[]
}

/**
 * Execute direct-tier and simple-create-tier actions without an LLM call.
 */
async function handleDirectActions(
  actions: ActionDef[],
  selectedIds: string[],
  executors: Map<string, (args: unknown) => Promise<unknown>>,
  placements: Array<{ actionId: string; index: number; origin: { x: number; y: number } }>,
): Promise<DirectResult> {
  const results: string[] = []
  const failed: string[] = []
  // Track consumed placement indices to handle duplicate action IDs
  const consumedPlacementIndices = new Set<number>()

  for (const def of actions) {
    try {
      // ── Layout actions ──────────────────────────────────────
      if (def.tier === 'direct' && def.id in LAYOUT_MAP) {
        const executor = executors.get('layoutObjects')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        const result = await executor({ objectIds: selectedIds, layout: LAYOUT_MAP[def.id] }) as Record<string, unknown>
        if (result.error) { failed.push(`${def.label}: ${result.error}`); continue }
        const count = (result.movedCount as number) ?? selectedIds.length
        results.push(`Arranged ${count} object${count !== 1 ? 's' : ''} in ${def.id === 'grid' ? 'a grid' : def.id === 'circle' ? 'a circle' : `a ${def.id} row`}.`)
        continue
      }

      // ── Duplicate ──────────────────────────────────────────
      if (def.id === 'duplicate') {
        const executor = executors.get('duplicateObject')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        let count = 0
        for (const id of selectedIds) {
          const result = await executor({ id }) as Record<string, unknown>
          if (!result.error) count++
        }
        results.push(`Duplicated ${count} object${count !== 1 ? 's' : ''}.`)
        continue
      }

      // ── Group ──────────────────────────────────────────────
      if (def.id === 'group') {
        const executor = executors.get('groupObjects')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        const result = await executor({ objectIds: selectedIds }) as Record<string, unknown>
        if (result.error) { failed.push(`${def.label}: ${result.error}`); continue }
        results.push(`Grouped ${(result.childCount as number) ?? selectedIds.length} objects.`)
        continue
      }

      // ── Ungroup ────────────────────────────────────────────
      if (def.id === 'ungroup') {
        const executor = executors.get('ungroupObjects')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        // Ungroup each selected group
        let count = 0
        for (const id of selectedIds) {
          const result = await executor({ groupId: id }) as Record<string, unknown>
          if (!result.error) count += (result.ungroupedCount as number) ?? 1
        }
        results.push(`Ungrouped ${count} object${count !== 1 ? 's' : ''}.`)
        continue
      }

      // ── Bring to front / Send to back ─────────────────────
      if (def.id === 'bring-front' || def.id === 'send-back') {
        const executor = executors.get('updateZIndex')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        const action = def.id === 'bring-front' ? 'front' : 'back'
        let count = 0
        for (const id of selectedIds) {
          const result = await executor({ id, action }) as Record<string, unknown>
          if (!result.error) count++
        }
        results.push(def.id === 'bring-front'
          ? `Brought ${count} object${count !== 1 ? 's' : ''} to front.`
          : `Sent ${count} object${count !== 1 ? 's' : ''} to back.`)
        continue
      }

      // ── Add table row ──────────────────────────────────────
      if (def.id === 'add-table-row') {
        const executor = executors.get('addTableRow')
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        const result = await executor({ objectId: selectedIds[0] }) as Record<string, unknown>
        if (result.error) { failed.push(`${def.label}: ${result.error}`); continue }
        results.push('Added a row to the table.')
        continue
      }

      // ── Simple-create actions ──────────────────────────────
      if (def.tier === 'simple-create' && def.id in SIMPLE_CREATE_MAP) {
        const spec = SIMPLE_CREATE_MAP[def.id]!
        const executor = executors.get(spec.tool)
        if (!executor) { failed.push(`${def.label}: tool not available`); continue }
        // Find next unconsumed precomputed placement for this action
        const placementIdx = placements.findIndex((p, i) => p.actionId === def.id && !consumedPlacementIndices.has(i))
        const placement = placementIdx >= 0 ? placements[placementIdx] : undefined
        if (placementIdx >= 0) consumedPlacementIndices.add(placementIdx)
        const coords = placement ? placement.origin : { x: 100, y: 100 }
        const result = await executor(spec.args(coords)) as Record<string, unknown>
        if (result.error) { failed.push(`${def.label}: ${result.error}`); continue }
        results.push(def.confirmMessage ?? `Created ${def.label.toLowerCase().replace('add ', '')}.`)
        continue
      }

      // Fallback — shouldn't happen for properly classified actions
      failed.push(`${def.label}: unhandled direct action`)
    } catch (err) {
      failed.push(`${def.label}: ${(err as Error).message}`)
    }
  }

  return { results, failed }
}

/**
 * Build a synthetic SSE response for direct-only requests (no LLM call).
 */
function buildDirectSSEResponse(results: string[], failed: string[]): ReadableStream {
  const encoder = new TextEncoder()
  const lines: string[] = []

  if (results.length > 0) {
    lines.push(results.join(' '))
  }
  if (failed.length > 0) {
    lines.push(`Some actions had issues: ${failed.join('; ')}`)
  }

  const text = lines.join('\n\n') || 'Done.'

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseEvent({ type: 'text-delta', text })))
      controller.enqueue(encoder.encode(sseEvent({ type: 'done' })))
      controller.close()
    },
  })
}

// ── Main handler ────────────────────────────────────────────────────────────

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

  // ── Validate inputs ───────────────────────────────────────
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

  // ── Classify actions by tier ──────────────────────────────
  const validQuickActionIds = Array.isArray(quickActionIds) && quickActionIds.length > 0
    ? quickActionIds
        .filter((id): id is string => typeof id === 'string' && id in QUICK_ACTION_TOOL_GROUPS)
        .slice(0, MAX_QUICK_ACTION_IDS)
    : quickActionId && typeof quickActionId === 'string' && quickActionId in QUICK_ACTION_TOOL_GROUPS
      ? [quickActionId]
      : []

  const actionDefs = validQuickActionIds
    .map(id => ACTION_MAP[id])
    .filter((d): d is ActionDef => d !== undefined)

  const directActions = actionDefs.filter(def => def.tier === 'direct' || def.tier === 'simple-create')
  const llmActions = actionDefs.filter(def => def.tier === 'llm')
  const allDirect = directActions.length === actionDefs.length && actionDefs.length > 0

  // ── Precompute placements ─────────────────────────────────
  const placements = precomputePlacements(
    boardState.objects,
    validQuickActionIds,
    validViewport ? viewportCenter : undefined,
  )

  // ── Build tools + executors (needed for both direct and LLM paths) ────────
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

  // ── Direct-only path: no LLM call ────────────────────────
  if (allDirect) {
    const { results, failed } = await handleDirectActions(
      directActions,
      validSelectedIds ?? [],
      executors,
      placements,
    )
    return new Response(buildDirectSSEResponse(results, failed), { headers: SSE_HEADERS })
  }

  // ── Mixed path: execute direct actions first, then LLM ───
  let directContext = ''
  if (directActions.length > 0) {
    const { results, failed } = await handleDirectActions(
      directActions,
      validSelectedIds ?? [],
      executors,
      placements,
    )
    const parts: string[] = []
    if (results.length > 0) parts.push(...results)
    if (failed.length > 0) parts.push(`Failed: ${failed.join('; ')}`)
    if (parts.length > 0) {
      directContext = `[Already executed: ${parts.join(' ')}]`
    }
  }

  // ── Build user message with injected board state ──────────
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

  const precomputedBlock = placements.length > 0 ? `\n\n${formatPrecomputedPlacements(placements)}` : ''

  // For LLM-tier template actions, use the label in the user message (prompt goes to system)
  const userMessageText = llmActions.length > 0
    ? llmActions.map((a, i) => `${i + 1}. ${a.label}`).join('\n')
    : message

  const directPrefix = directContext ? `${directContext}\n\n` : ''
  // The client sends "1. Label\n2. Label\n\nFree text" — extract free text after the double newline
  const freeTextSeparator = message.indexOf('\n\n')
  const freeText = llmActions.length > 0 && freeTextSeparator >= 0
    ? message.slice(freeTextSeparator + 2).trim()
    : ''
  const userInput = llmActions.length > 0
    ? userMessageText + (freeText ? `\n\n${freeText}` : '')
    : message

  const userContent = stateJson !== '[]'
    ? `[${safeDisplayName} (${roleName})]: ${directPrefix}${selectionHint}${queueHint}${userInput}${precomputedBlock}\n\n<board_state${truncationNote}>${stateJson}</board_state>`
    : `[${safeDisplayName} (${roleName})]: ${directPrefix}${selectionHint}${queueHint}${userInput}${precomputedBlock}`

  // ── Build dynamic system prompt suffix for LLM action instructions ───
  let systemPrompt = SYSTEM_PROMPT
  const templateActions = llmActions.filter(a => a.category === 'template')
  const nonTemplateActions = llmActions.filter(a => a.category !== 'template')
  if (templateActions.length > 0) {
    const templateInstructions = templateActions
      .map(a => `### ${a.label}\n${a.prompt}`)
      .join('\n\n')
    systemPrompt += `\n\n## Template instructions\n${templateInstructions}`
  }
  if (nonTemplateActions.length > 0) {
    const actionInstructions = nonTemplateActions
      .map(a => `### ${a.label}\n${a.prompt}`)
      .join('\n\n')
    systemPrompt += `\n\n## Action instructions\n${actionInstructions}`
  }

  // ── Stream ────────────────────────────────────────────────
  const toolDefinitions = getToolDefinitions({
    excludeTools,
    ...(includeTools ? { includeTools } : {}),
  })
  const historyMessages = validConversationHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const openai = getOpenAI()
  const stream = runAgentLoop(openai, {
    messages: [
      { role: 'system', content: systemPrompt },
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
