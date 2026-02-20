/**
 * POST /api/agent/[boardId] — direct OpenAI Chat Completions streaming.
 * Replaced Fly.io proxy in Phase 2.
 */

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageFunctionToolCall
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBoardState } from '@/lib/agent/boardState'
import { resolveConnectionGraph } from '@/lib/agent/contextResolver'
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
  if (!agentObj || (agentObj as any).board_id !== boardId) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }
  const agentModel = agentObj?.model ?? 'gpt-4o'
  const agentName = agentObj?.text || 'Board Agent'

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

  // ── SSE stream ────────────────────────────────────────────
  const toolCtx = createToolContext(boardId, user.id, boardState)
  const { definitions: toolDefinitions, executors } = createTools(toolCtx)

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]

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
            model: agentModel,
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

          // No tool calls → done
          if (pendingToolCalls.size === 0 || finishReason === 'stop') {
            break
          }

          // Push assistant message with tool_calls
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

          // Execute each tool call
          const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
          for (const tc of toolCallsArr as FunctionToolCall[]) {
            const toolName = tc.function.name
            let args: unknown
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = {}
            }

            enqueue({ type: 'tool-call', toolName, args })

            const executor = executors.get(toolName)
            let result: unknown
            if (executor) {
              result = await executor(args)
            } else {
              result = { error: `Unknown tool: ${toolName}` }
            }

            enqueue({ type: 'tool-result', toolName, result })

            toolResultMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            })
          }

          messages.push(...toolResultMessages)
        }

        // ── Persist assistant response ─────────────────────
        if (fullAssistantContent) {
          await admin.from('board_messages').insert({
            board_id: boardId,
            agent_object_id: agentObjectId,
            role: 'assistant',
            content: fullAssistantContent,
          })
        }

        // ── Set agent_state to done ────────────────────────
        await admin
          .from('board_objects')
          .update({ agent_state: 'done' })
          .eq('id', agentObjectId)
          .eq('board_id', boardId)
          .is('deleted_at', null)

        enqueue({ type: 'done' })
      } catch (err) {
        console.error('[api/agent] Stream error details:', err)
        const errMsg = (err as Error).message ?? ''
        const errorMsg = errMsg.includes('429')
          ? 'Rate limit reached, please try again.'
          : 'An error occurred. Please try again.'

        try {
          enqueue({ type: 'error', error: errorMsg })
          await admin
            .from('board_objects')
            .update({ agent_state: 'error' })
            .eq('id', agentObjectId)
            .eq('board_id', boardId)
            .is('deleted_at', null)
        } catch { /* best effort */ }
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
