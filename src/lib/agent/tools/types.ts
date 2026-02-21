/**
 * Shared types for agent tool system.
 */

import type { HLC } from '@/lib/crdt/hlc'
import type { BoardState } from '@/lib/agent/boardState'

export interface ToolContext {
  boardId: string
  userId: string
  hlc: HLC
  state: BoardState
}

/**
 * A fully-wrapped tool definition (name, description, validated executor).
 */
export interface ToolDef {
  name: string
  description: string
  /** Validates rawArgs with the tool's Zod schema, then calls execute. */
  executor: (ctx: ToolContext, rawArgs: unknown) => Promise<unknown>
}
