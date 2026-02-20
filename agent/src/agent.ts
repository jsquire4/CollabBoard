/**
 * AI agent configuration — streamText + tool wiring.
 */

import { streamText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createTools } from './tools/index.js'
import { createHLC, type HLC } from './lib/hlc.js'
import { loadBoardState } from './state.js'
import { logTrace } from './lib/langsmith.js'
import type { BoardMessage } from './types.js'

const SYSTEM_PROMPT = `You are an AI assistant for CollabBoard, a collaborative whiteboard application.

You can create and manipulate objects on the board using your tools. When the user asks you to create shapes, notes, tables, or other visual elements, use the appropriate tools.

Guidelines:
- When creating multiple connected objects (like flowcharts), use createShape/createStickyNote first, then createConnector to link them.
- Use getBoardState first if you need to understand what's currently on the board.
- Position objects thoughtfully — avoid overlapping by spacing them 200+ pixels apart.
- Use clear, descriptive text for shapes and notes.
- When asked to create a flowchart or diagram, create all shapes first, then add connectors between them.
- For tables, use createTable with appropriate column and row counts.
- When updating text, always use updateText to keep rich_text in sync.
- You can describe uploaded images using describeImage, and read uploaded text files using readFileContent.
- Be concise in your responses. Confirm what you created/changed.`

export interface AgentStreamOptions {
  message: string
  history: BoardMessage[]
  boardId: string
  userId: string
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAgentStream({ message, history, boardId, userId }: AgentStreamOptions) {
  const hlc: HLC = createHLC(`agent-${userId}`)
  const tools = createTools({ boardId, userId, hlc })

  const messages = [
    ...history
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    { role: 'user' as const, content: message },
  ]

  const startTime = Date.now()

  return streamText({
    model: openai('gpt-4o'),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish({ toolCalls, usage }) {
      const latencyMs = Date.now() - startTime
      const toolNames = toolCalls?.map(tc => tc.toolName)
      logTrace({
        boardId,
        userId,
        toolName: toolNames?.join(', '),
        tokenUsage: usage ? {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
        } : undefined,
        latencyMs,
      })
    },
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createGreetingStream(isNewBoard: boolean) {
  return streamText({
    model: openai('gpt-4o'),
    system: 'You are a friendly AI assistant for CollabBoard, a collaborative whiteboard. Be brief and helpful.',
    prompt: isNewBoard
      ? 'Welcome the user to their new board. Be brief and enthusiastic (1-2 sentences). Ask how you can help them get started.'
      : 'Welcome the user back to their board. Be brief (1-2 sentences). Ask what they would like to work on.',
    stopWhen: stepCountIs(1),
  })
}
