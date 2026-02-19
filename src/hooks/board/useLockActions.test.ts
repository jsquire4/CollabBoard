import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLockActions } from './useLockActions'
import { makeRectangle, objectsMap, resetFactory } from '@/test/boardObjectFactory'

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    objects: new Map() as Map<string, ReturnType<typeof makeRectangle>>,
    selectedIds: new Set<string>(),
    isObjectLocked: vi.fn(() => false),
    lockObject: vi.fn(),
    unlockObject: vi.fn(),
    userRole: 'editor' as const,
    userId: 'user-1',
    ...overrides,
  }
}

describe('useLockActions', () => {
  beforeEach(() => resetFactory())

  describe('canLockObject', () => {
    it('returns true for owner', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'owner' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canLockObject('r1')).toBe(true)
    })

    it('returns true for manager', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'manager' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canLockObject('r1')).toBe(true)
    })

    it('returns false for editor', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'editor' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canLockObject('r1')).toBe(false)
    })

    it('returns false for viewer', () => {
      const rect = makeRectangle({ id: 'r1' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'viewer' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canLockObject('r1')).toBe(false)
    })

    it('returns false for nonexistent object', () => {
      const deps = makeDeps({ userRole: 'owner' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canLockObject('nonexistent')).toBe(false)
    })
  })

  describe('canUnlockObject', () => {
    it('owner can unlock any object', () => {
      const rect = makeRectangle({ id: 'r1', locked_by: 'other-user' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'owner' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canUnlockObject('r1')).toBe(true)
    })

    it('manager can only unlock own locks', () => {
      const rect1 = makeRectangle({ id: 'r1', locked_by: 'user-1' })
      const rect2 = makeRectangle({ id: 'r2', locked_by: 'other-user' })
      const deps = makeDeps({ objects: objectsMap(rect1, rect2), userRole: 'manager', userId: 'user-1' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canUnlockObject('r1')).toBe(true)
      expect(result.current.canUnlockObject('r2')).toBe(false)
    })

    it('editor cannot unlock', () => {
      const rect = makeRectangle({ id: 'r1', locked_by: 'user-1' })
      const deps = makeDeps({ objects: objectsMap(rect), userRole: 'editor', userId: 'user-1' })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.canUnlockObject('r1')).toBe(false)
    })
  })

  describe('handleLockSelected', () => {
    it('locks unlocked objects the user can lock', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const r2 = makeRectangle({ id: 'r2' })
      const isObjectLocked = vi.fn((id: string) => id === 'r2') // r2 already locked
      const deps = makeDeps({
        objects: objectsMap(r1, r2),
        selectedIds: new Set(['r1', 'r2']),
        userRole: 'owner',
        isObjectLocked,
      })
      const { result } = renderHook(() => useLockActions(deps))
      act(() => result.current.handleLockSelected())
      expect(deps.lockObject).toHaveBeenCalledWith('r1')
      expect(deps.lockObject).not.toHaveBeenCalledWith('r2')
    })
  })

  describe('handleUnlockSelected', () => {
    it('unlocks locked objects the user can unlock', () => {
      const r1 = makeRectangle({ id: 'r1', locked_by: 'user-1' })
      const isObjectLocked = vi.fn(() => true)
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        userRole: 'owner',
        isObjectLocked,
      })
      const { result } = renderHook(() => useLockActions(deps))
      act(() => result.current.handleUnlockSelected())
      expect(deps.unlockObject).toHaveBeenCalledWith('r1')
    })
  })

  describe('derived values', () => {
    it('anySelectedLocked is true when any selected is locked', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const isObjectLocked = vi.fn((id: string) => id === 'r1')
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        isObjectLocked,
      })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.anySelectedLocked).toBe(true)
    })

    it('anySelectedLocked is false when none locked', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        isObjectLocked: vi.fn(() => false),
      })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.anySelectedLocked).toBe(false)
    })

    it('selectedCanLock checks permissions and lock state', () => {
      const r1 = makeRectangle({ id: 'r1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        userRole: 'owner',
        isObjectLocked: vi.fn(() => false),
      })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.selectedCanLock).toBe(true)
    })

    it('selectedCanUnlock checks permissions and lock state', () => {
      const r1 = makeRectangle({ id: 'r1', locked_by: 'user-1' })
      const deps = makeDeps({
        objects: objectsMap(r1),
        selectedIds: new Set(['r1']),
        userRole: 'owner',
        isObjectLocked: vi.fn(() => true),
      })
      const { result } = renderHook(() => useLockActions(deps))
      expect(result.current.selectedCanUnlock).toBe(true)
    })
  })
})
