/**
 * Board agent tool definitions in OpenAI Chat Completions format.
 *
 * Returns:
 *   definitions — OpenAI.Chat.ChatCompletionTool[] for the API call
 *   executors   — Map<toolName, (args) => Promise<unknown>> for tool dispatch
 *
 * Tools are split by domain:
 *   createObjects.ts  — createStickyNote, createShape, createFrame, createTable, createConnector
 *   editObjects.ts    — moveObject, resizeObject, updateText, changeColor, deleteObject
 *   queryObjects.ts   — getBoardState, getFrameObjects
 *   fileTools.ts      — describeImage, readFileContent
 */

import type OpenAI from 'openai'
import { createHLC } from '@/lib/crdt/hlc'
import type { BoardState } from '@/lib/agent/boardState'
import { TOOL_SCHEMAS } from './schemas'
import { createObjectTools } from './createObjects'
import { editObjectTools } from './editObjects'
import { queryObjectTools } from './queryObjects'
import { fileTools } from './fileTools'
import type { ToolContext } from './types'

export type { ToolContext } from './types'

// ── Tool definition builder ───────────────────────────────────────────────────

function openaiTool(name: string, description: string, parameters: Record<string, unknown>): OpenAI.Chat.ChatCompletionTool {
  return {
    type: 'function' as const,
    function: { name, description, parameters },
  }
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function createTools(ctx: ToolContext): {
  definitions: OpenAI.Chat.ChatCompletionTool[]
  executors: Map<string, (args: unknown) => Promise<unknown>>
} {
  const definitions: OpenAI.Chat.ChatCompletionTool[] = []
  const executors = new Map<string, (args: unknown) => Promise<unknown>>()

  const allTools = [
    ...createObjectTools,
    ...editObjectTools,
    ...queryObjectTools,
    ...fileTools,
  ]

  for (const tool of allTools) {
    definitions.push(openaiTool(
      tool.name,
      tool.description,
      TOOL_SCHEMAS[tool.name] ?? { type: 'object', properties: {} },
    ))
    executors.set(tool.name, (rawArgs: unknown) => tool.executor(ctx, rawArgs))
  }

  return { definitions, executors }
}

// ── Helper: create a fresh ToolContext with a new HLC ─────────────────────────

export function createToolContext(boardId: string, userId: string, state: BoardState): ToolContext {
  return {
    boardId,
    userId,
    hlc: createHLC(userId),
    state,
  }
}
