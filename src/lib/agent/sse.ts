/**
 * Shared SSE streaming loop for agent routes.
 * Eliminates the duplicate streaming loop in route.ts and global/route.ts.
 */

import OpenAI from 'openai'
type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageFunctionToolCall

// Maximum tool-call steps per request
const MAX_STEPS = 10

// Maximum characters for a single tool-call argument blob (prevents huge DB writes)
const MAX_TOOL_ARG_CHARS = 4_096

export interface AgentLoopConfig {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  tools: OpenAI.Chat.ChatCompletionTool[]
  model: string
  executors: Map<string, (args: unknown) => Promise<unknown>>
  onMessage(msg: OpenAI.Chat.ChatCompletionMessageParam): Promise<void>
  onToolResult(name: string, result: unknown): Promise<void>
  onError(err: Error): Promise<void>
  onDone(accumulatedContent: string, accumulatedToolCalls: FunctionToolCall[]): Promise<void>
}

export function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

/**
 * Run the agent loop and return a ReadableStream of SSE events.
 * The caller is responsible for auth, history loading, and message persistence —
 * this function only handles the OpenAI streaming loop.
 */
export function runAgentLoop(
  openai: OpenAI,
  config: AgentLoopConfig,
): ReadableStream {
  const { messages, tools, model, executors } = config
  const encoder = new TextEncoder()
  let fullAssistantContent = ''
  const allToolCalls: FunctionToolCall[] = []

  return new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        let stepCount = 0

        while (stepCount < MAX_STEPS) {
          stepCount++

          const completion = await openai.chat.completions.create({
            model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
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

          // Truncate oversized args before persisting
          const toolCallsArr: FunctionToolCall[] = Array.from(pendingToolCalls.values()).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.args.length > MAX_TOOL_ARG_CHARS
                ? tc.args.slice(0, MAX_TOOL_ARG_CHARS)
                : tc.args,
            },
          }))

          allToolCalls.push(...toolCallsArr)

          messages.push({
            role: 'assistant',
            content: chunkContent || null,
            tool_calls: toolCallsArr,
          })

          // Execute each tool call
          const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
          for (const tc of toolCallsArr) {
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
            await config.onToolResult(toolName, result)

            toolResultMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            })
          }

          // Notify caller of the assistant message (for persistence)
          await config.onMessage({
            role: 'assistant',
            content: chunkContent || null,
            tool_calls: toolCallsArr,
          })

          messages.push(...toolResultMessages)
        }

        await config.onDone(fullAssistantContent, allToolCalls)
        enqueue({ type: 'done' })
      } catch (err) {
        const error = err as Error
        const errMsg = error.message ?? ''
        const userMsg = errMsg.includes('429')
          ? 'Rate limit reached, please try again.'
          : 'An error occurred. Please try again.'
        enqueue({ type: 'error', error: userMsg })
        try { await config.onError(error) } catch { /* side-effect failures are non-fatal */ }
      } finally {
        controller.close()
      }
    },
  })
}
