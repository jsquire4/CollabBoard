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
 *   queryObjects.ts   — getConnectedObjects, getFrameObjects
 *   fileTools.ts      — describeImage, readFileContent
 */

import type OpenAI from 'openai'
import { createHLC } from '@/lib/crdt/hlc'
import type { BoardState } from '@/lib/agent/boardState'
import { TOOL_SCHEMAS } from './schemas'
import { createObjectTools } from './createObjects'
import { editObjectTools } from './editObjects'
import { queryObjectTools } from './queryObjects'
import { layoutObjectTools } from './layoutObjects'
import { organizeObjectTools } from './organizeObjects'
import { tableEditTools } from './tableEditTools'
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

// ── All tool arrays (shared across factory and definitions cache) ─────────────

const allToolDefs = [
  ...createObjectTools,
  ...editObjectTools,
  ...organizeObjectTools,
  ...tableEditTools,
  ...queryObjectTools,
  ...layoutObjectTools,
  ...fileTools,
]

// ── Cached definitions (static — schemas don't change at runtime) ────────────

const _defsCache = new Map<string, OpenAI.Chat.ChatCompletionTool[]>()

/**
 * Return tool definitions for a given exclude/include set.
 * Definitions are schema-only (no executors, no board state) and can be cached
 * at module level so callers like `ensureAssistant` don't block on board state.
 */
export function getToolDefinitions(options?: { excludeTools?: string[]; includeTools?: string[] }): OpenAI.Chat.ChatCompletionTool[] {
  const excludeTools = options?.excludeTools ?? []
  const includeTools = options?.includeTools
  const key = [
    excludeTools.slice().sort().join(','),
    includeTools ? `inc:${includeTools.slice().sort().join(',')}` : '',
  ].join('|')
  const cached = _defsCache.get(key)
  if (cached) return cached

  const excludeSet = new Set(excludeTools)
  const includeSet = includeTools ? new Set(includeTools) : null
  const defs: OpenAI.Chat.ChatCompletionTool[] = []
  for (const tool of allToolDefs) {
    if (excludeSet.has(tool.name)) continue
    if (includeSet && !includeSet.has(tool.name)) continue
    defs.push(openaiTool(
      tool.name,
      tool.description,
      TOOL_SCHEMAS[tool.name] ?? { type: 'object', properties: {} },
    ))
  }
  _defsCache.set(key, defs)
  return defs
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export interface CreateToolsOptions {
  /** Tool names to exclude from the returned set (e.g. ['saveMemory', 'createDataConnector']) */
  excludeTools?: string[]
  /** When set, only include these tools (still applies excludeTools) */
  includeTools?: string[]
}

export function createTools(ctx: ToolContext, options?: CreateToolsOptions): {
  definitions: OpenAI.Chat.ChatCompletionTool[]
  executors: Map<string, (args: unknown) => Promise<unknown>>
} {
  const definitions = getToolDefinitions({
    excludeTools: options?.excludeTools,
    includeTools: options?.includeTools,
  })
  const executors = new Map<string, (args: unknown) => Promise<unknown>>()
  const excludeSet = new Set(options?.excludeTools ?? [])
  const includeSet = options?.includeTools ? new Set(options.includeTools) : null

  for (const tool of allToolDefs) {
    if (excludeSet.has(tool.name)) continue
    if (includeSet && !includeSet.has(tool.name)) continue
    executors.set(tool.name, (rawArgs: unknown) => tool.executor(ctx, rawArgs))
  }

  return { definitions, executors }
}

// ── Helper: create a fresh ToolContext with a new HLC ─────────────────────────

export function createToolContext(
  boardId: string,
  userId: string,
  state: BoardState,
  agentObjectId?: string,
  viewportCenter?: { x: number; y: number },
): ToolContext {
  return {
    boardId,
    userId,
    hlc: createHLC(userId),
    state,
    agentObjectId,
    viewportCenter,
  }
}
