/**
 * Recovery storage for board state when Realtime connection is lost.
 * Saves to sessionStorage so we can restore after refresh and run reconcileOnReconnect.
 */

import type { BoardObject } from '@/types/board'
import type { FieldClocks } from '@/lib/crdt/merge'

const PREFIX = 'collabboard_recovery_'
const MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export interface RecoveryData {
  boardId: string
  savedAt: number
  objects: [string, BoardObject][]
  fieldClocks: [string, FieldClocks][]
}

function key(boardId: string): string {
  return `${PREFIX}${boardId}`
}

export function saveRecovery(
  boardId: string,
  objects: Map<string, BoardObject>,
  fieldClocks: Map<string, FieldClocks>
): void {
  try {
    const data: RecoveryData = {
      boardId,
      savedAt: Date.now(),
      objects: Array.from(objects.entries()),
      fieldClocks: Array.from(fieldClocks.entries()),
    }
    sessionStorage.setItem(key(boardId), JSON.stringify(data))
  } catch (e) {
    console.warn('[Recovery] Failed to save:', e)
  }
}

export function getRecovery(boardId: string): RecoveryData | null {
  try {
    const raw = sessionStorage.getItem(key(boardId))
    if (!raw) return null
    const data = JSON.parse(raw) as RecoveryData
    if (data.boardId !== boardId) return null
    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      clearRecovery(boardId)
      return null
    }
    return data
  } catch {
    return null
  }
}

export function clearRecovery(boardId: string): void {
  try {
    sessionStorage.removeItem(key(boardId))
  } catch {
    // ignore
  }
}

const AUTO_REFRESH_FLAG = 'collabboard_auto_refresh_attempted'

/** True if we already tried an auto-refresh this "cycle" (since last successful connection). */
export function hasAutoRefreshBeenAttempted(): boolean {
  try {
    return sessionStorage.getItem(AUTO_REFRESH_FLAG) === '1'
  } catch {
    return false
  }
}

export function setAutoRefreshAttempted(): void {
  try {
    sessionStorage.setItem(AUTO_REFRESH_FLAG, '1')
  } catch {
    // ignore
  }
}

/** Clear when we successfully connect so the next disconnect can auto-refresh once. */
export function clearAutoRefreshAttempted(): void {
  try {
    sessionStorage.removeItem(AUTO_REFRESH_FLAG)
  } catch {
    // ignore
  }
}
