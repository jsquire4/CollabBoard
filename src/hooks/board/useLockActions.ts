import { useCallback, useMemo } from 'react'
import { BoardObject } from '@/types/board'
import { BoardRole } from '@/types/sharing'

interface UseLockActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  isObjectLocked: (id: string) => boolean
  lockObject: (id: string) => void
  unlockObject: (id: string) => void
  userRole: BoardRole
  userId: string
}

export function useLockActions({
  objects,
  selectedIds,
  isObjectLocked,
  lockObject,
  unlockObject,
  userRole,
  userId,
}: UseLockActionsDeps) {
  const canLockObject = useCallback((id: string): boolean => {
    const obj = objects.get(id)
    if (!obj) return false
    if (userRole === 'owner') return true
    if (userRole === 'manager') return true
    return false
  }, [objects, userRole])

  const canUnlockObject = useCallback((id: string): boolean => {
    const obj = objects.get(id)
    if (!obj) return false
    if (userRole === 'owner') return true
    if (userRole === 'manager') return obj.locked_by === userId
    return false
  }, [objects, userRole, userId])

  const handleLockSelected = useCallback(() => {
    for (const id of selectedIds) {
      if (canLockObject(id) && !isObjectLocked(id)) {
        lockObject(id)
      }
    }
  }, [selectedIds, canLockObject, isObjectLocked, lockObject])

  const handleUnlockSelected = useCallback(() => {
    for (const id of selectedIds) {
      if (canUnlockObject(id) && isObjectLocked(id)) {
        unlockObject(id)
      }
    }
  }, [selectedIds, canUnlockObject, isObjectLocked, unlockObject])

  const anySelectedLocked = useMemo(() => {
    for (const id of selectedIds) {
      if (isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, isObjectLocked])

  const selectedCanLock = useMemo(() => {
    for (const id of selectedIds) {
      if (canLockObject(id) && !isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, canLockObject, isObjectLocked])

  const selectedCanUnlock = useMemo(() => {
    for (const id of selectedIds) {
      if (canUnlockObject(id) && isObjectLocked(id)) return true
    }
    return false
  }, [selectedIds, canUnlockObject, isObjectLocked])

  return {
    canLockObject,
    canUnlockObject,
    handleLockSelected,
    handleUnlockSelected,
    anySelectedLocked,
    selectedCanLock,
    selectedCanUnlock,
  }
}
