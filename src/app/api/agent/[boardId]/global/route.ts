/**
 * POST /api/agent/[boardId]/global — global board agent using Chat Completions.
 *
 * Unlike per-agent routes, this is scoped to the whole board (agent_object_id IS NULL).
 * Message prefix: "[Alice (editor)]: message" for multi-user attribution.
 * The global_agent_thread_id column is reserved for a future Assistants API upgrade.
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageFunctionToolCall
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState } from '@/lib/agent/boardState'
import { createTools, createToolContext } from '@/lib/agent/tools'
import { getUserDisplayName } from '@/lib/userUtils'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
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

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: prefixedMessage },
  ]

  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  const encoder = new TextEncoder()
  let fullAssistantContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        let stepCount = 0
        const MAX_STEPS = 10

        while (stepCount < MAX_STEPS) {
          stepCount++

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
            tool_choice: toolDefinitions.length > 0 ? 'auto' : undefined,
            stream: true,
          })

          let chunkContent = ''
          const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map()
          let finishReason: string | null = null

          for await (const chunk of completion) {
            const choice = chunk.choices[0]
            if (!choice) continue

            finishReason = choice.finish_reason ?? finishReason
            const delta = choice.delta

            if (delta.content) {
              chunkContent += delta.content
              fullAssistantContent += delta.content
              enqueue({ type: 'text-delta', text: delta.content })
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = pendingToolCalls.get(tc.index) ?? { id: '', name: '', args: '' }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) existing.args += tc.function.arguments
                pendingToolCalls.set(tc.index, existing)
              }
            }
          }

          if (pendingToolCalls.size === 0 || finishReason === 'stop') break

          const toolCallsArr: FunctionToolCall[] = Array.from(pendingToolCalls.values()).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.args },
          }))

          messages.push({
            role: 'assistant',
            content: chunkContent || null,
            tool_calls: toolCallsArr,
          })

          const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
          for (const tc of toolCallsArr as FunctionToolCall[]) {
            const toolName = tc.function.name
            let args: unknown
            try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

            enqueue({ type: 'tool-call', toolName, args })

            const executor = executors.get(toolName)
            const result = executor ? await executor(args) : { error: `Unknown tool: ${toolName}` }

            enqueue({ type: 'tool-result', toolName, result })
            toolResultMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            })
          }

          messages.push(...toolResultMessages)
        }

        // Persist assistant response
        if (fullAssistantContent) {
          await admin.from('board_messages').insert({
            board_id: boardId,
            agent_object_id: null,
            role: 'assistant',
            content: fullAssistantContent,
          })
        }

        enqueue({ type: 'done' })
      } catch (err) {
        console.error('[api/agent/global] Stream error details:', err)
        const errMsg = (err as Error).message ?? ''
        const errorMsg = errMsg.includes('429')
          ? 'Rate limit reached, please try again.'
          : 'An error occurred. Please try again.'
        enqueue({ type: 'error', error: errorMsg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
