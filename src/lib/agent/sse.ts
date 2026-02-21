/**
 * Shared SSE streaming loop for agent routes.
 * Eliminates the duplicate streaming loop in route.ts and global/route.ts.
 */

import OpenAI from 'openai'
type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageFunctionToolCall
type AssistantStreamEvent = OpenAI.Beta.Assistants.AssistantStreamEvent

let _openai: OpenAI | null = null

/** Lazily instantiate the OpenAI client so route modules can load even when
 *  OPENAI_API_KEY is not yet in the environment (e.g. during build).
 *  When LANGSMITH_API_KEY is set, wraps the client for automatic tracing. */
export function getOpenAI(): OpenAI {
  if (!_openai) {
    let client: OpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    if (process.env.LANGSMITH_API_KEY) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { wrapOpenAI } = require('langsmith/wrappers/openai')
        client = wrapOpenAI(client)
      } catch {
        // langsmith not available — continue without tracing
      }
    }
    _openai = client
  }
  return _openai
}

// Maximum tool-call steps per request
const MAX_STEPS = 10

// Maximum characters for a single tool-call argument blob (prevents huge DB writes)
const MAX_TOOL_ARG_CHARS = 4_096

export interface TraceMetadata {
  boardId?: string
  userId?: string
  agentType?: string
  [key: string]: unknown
}

export interface AgentLoopConfig {
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  tools: OpenAI.Chat.ChatCompletionTool[]
  model: string
  executors: Map<string, (args: unknown) => Promise<unknown>>
  /** Optional LangSmith trace metadata (boardId, userId, agentType) */
  traceMetadata?: TraceMetadata
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

          const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
            model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            stream: true,
          }
          // LangSmith metadata — wrapOpenAI reads langsmithExtra from the second arg
          const langsmithOpts = config.traceMetadata
            ? { langsmithExtra: { metadata: config.traceMetadata } }
            : undefined
          const completion = await openai.chat.completions.create(
            createParams,
            langsmithOpts as Parameters<typeof openai.chat.completions.create>[1],
          )

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

// ── Assistants API streaming loop ─────────────────────────────────────────────

export interface AssistantsLoopConfig {
  threadId: string
  assistantId: string
  additionalInstructions?: string
  executors: Map<string, (args: unknown) => Promise<unknown>>
  /** Optional LangSmith trace metadata (boardId, userId, agentType) */
  traceMetadata?: TraceMetadata
  /** Extra parameters forwarded to threads.runs.stream (e.g. truncation_strategy, max_prompt_tokens) */
  runOptions?: Record<string, unknown>
  onDone(content: string): Promise<void>
  onError(err: Error): Promise<void>
}

/**
 * Run an OpenAI Assistants API streaming loop.
 * Emits the same SSE event format as runAgentLoop so the client hook works unchanged.
 */
export function runAssistantsLoop(
  openai: OpenAI,
  config: AssistantsLoopConfig,
): ReadableStream {
  const { threadId, assistantId, executors } = config
  const encoder = new TextEncoder()
  let fullContent = ''

  return new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        let stepCount = 0

        // Initial run
        let stream = openai.beta.threads.runs.stream(threadId, {
          assistant_id: assistantId,
          ...(config.additionalInstructions
            ? { additional_instructions: config.additionalInstructions }
            : {}),
          ...(config.runOptions ?? {}),
        })

        // Label needed so `continue` after tool output submission targets
        // the outer while loop (not the inner for-await).
        outer: while (stepCount < MAX_STEPS) {
          stepCount++

          for await (const event of stream as AsyncIterable<AssistantStreamEvent>) {
            if (event.event === 'thread.message.delta') {
              const delta = event.data.delta
              if (delta.content) {
                for (const block of delta.content) {
                  if (block.type === 'text' && block.text?.value) {
                    fullContent += block.text.value
                    enqueue({ type: 'text-delta', text: block.text.value })
                  }
                }
              }
            } else if (event.event === 'thread.run.requires_action') {
              const run = event.data
              const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls
              if (!toolCalls || toolCalls.length === 0) {
                // Submit empty outputs to unblock the run on OpenAI's side
                stream = openai.beta.threads.runs.submitToolOutputsStream(
                  run.id,
                  { thread_id: threadId, tool_outputs: [] },
                )
                continue outer
              }

              const toolOutputs: { tool_call_id: string; output: string }[] = []

              for (const tc of toolCalls) {
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

                toolOutputs.push({
                  tool_call_id: tc.id,
                  output: JSON.stringify(result),
                })
              }

              // Submit tool outputs and continue streaming
              stream = openai.beta.threads.runs.submitToolOutputsStream(
                run.id,
                { thread_id: threadId, tool_outputs: toolOutputs },
              )

              // Continue the outer while loop to process the new stream
              continue outer
            } else if (event.event === 'thread.run.completed') {
              break
            } else if (
              event.event === 'thread.run.failed' ||
              event.event === 'thread.run.cancelled' ||
              event.event === 'thread.run.expired'
            ) {
              const failData = event.data as { last_error?: { message?: string } }
              const failMsg = failData.last_error?.message ?? `Run ${event.event.replace('thread.run.', '')}`
              throw new Error(failMsg)
            }
          }

          // If we get here without a requires_action continue, we're done
          break
        }

        await config.onDone(fullContent)
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
