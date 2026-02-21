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
