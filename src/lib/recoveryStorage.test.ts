/**
 * Tests for recovery storage (sessionStorage save/load/clear).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BoardObject } from '@/types/board'
import type { FieldClocks } from '@/lib/crdt/merge'
import {
  saveRecovery,
  getRecovery,
  clearRecovery,
  hasAutoRefreshBeenAttempted,
  setAutoRefreshAttempted,
  clearAutoRefreshAttempted,
} from './recoveryStorage'

const BOARD_ID = 'board-123'
const mockObjects: [string, BoardObject][] = [
  ['obj-1', { id: 'obj-1', board_id: BOARD_ID, type: 'sticky_note', x: 10, y: 0, width: 100, height: 100, created_by: 'u1', created_at: '', updated_at: '', z_index: 0 } as BoardObject],
]
const mockClocks: [string, FieldClocks][] = [['obj-1', { x: { ts: 1, c: 0, n: 'a' } }]]

describe('recoveryStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saveRecovery writes to sessionStorage', () => {
    const objects = new Map(mockObjects)
    const fieldClocks = new Map(mockClocks)
    saveRecovery(BOARD_ID, objects, fieldClocks)
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'collabboard_recovery_board-123',
      expect.stringContaining(BOARD_ID)
    )
  })

  it('getRecovery returns null when empty', () => {
    ;(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)
    expect(getRecovery(BOARD_ID)).toBeNull()
  })

  it('getRecovery returns parsed data when valid', () => {
    const data = {
      boardId: BOARD_ID,
      savedAt: Date.now(),
      objects: mockObjects,
      fieldClocks: mockClocks,
    }
    ;(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(data))
    const result = getRecovery(BOARD_ID)
    expect(result).not.toBeNull()
    expect(result!.boardId).toBe(BOARD_ID)
    expect(result!.objects).toEqual(mockObjects)
  })

  it('getRecovery returns null when expired', () => {
    const data = {
      boardId: BOARD_ID,
      savedAt: Date.now() - 11 * 60 * 1000,
      objects: mockObjects,
      fieldClocks: mockClocks,
    }
    ;(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(data))
    expect(getRecovery(BOARD_ID)).toBeNull()
    expect(sessionStorage.removeItem).toHaveBeenCalled()
  })

  it('clearRecovery removes from sessionStorage', () => {
    clearRecovery(BOARD_ID)
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('collabboard_recovery_board-123')
  })

  it('hasAutoRefreshBeenAttempted returns false when not set', () => {
    ;(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)
    expect(hasAutoRefreshBeenAttempted()).toBe(false)
  })

  it('hasAutoRefreshBeenAttempted returns true when set', () => {
    ;(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('1')
    expect(hasAutoRefreshBeenAttempted()).toBe(true)
  })

  it('setAutoRefreshAttempted writes to sessionStorage', () => {
    setAutoRefreshAttempted()
    expect(sessionStorage.setItem).toHaveBeenCalledWith('collabboard_auto_refresh_attempted', '1')
  })

  it('clearAutoRefreshAttempted removes flag', () => {
    clearAutoRefreshAttempted()
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('collabboard_auto_refresh_attempted')
  })
})
