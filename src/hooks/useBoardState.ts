'use client'

import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { BoardObject, BoardObjectType } from '@/types/board'

const DEFAULT_BOARD_ID = '00000000-0000-0000-0000-000000000000'

const COLOR_PALETTE = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50']

export function useBoardState(userId: string) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const addObject = useCallback((
    type: BoardObjectType,
    x: number,
    y: number,
    overrides?: Partial<BoardObject>
  ) => {
    const id = uuidv4()
    const now = new Date().toISOString()

    const defaults: Record<string, Partial<BoardObject>> = {
      sticky_note: { width: 150, height: 150, color: '#FFEB3B', text: '' },
      rectangle: { width: 200, height: 140, color: '#2196F3', text: '' },
      circle: { width: 120, height: 120, color: '#4CAF50', text: '' },
    }

    const obj: BoardObject = {
      id,
      board_id: DEFAULT_BOARD_ID,
      type,
      x,
      y,
      width: 150,
      height: 150,
      rotation: 0,
      text: '',
      color: '#FFEB3B',
      font_size: 14,
      from_id: null,
      to_id: null,
      connector_style: 'arrow',
      created_by: userId,
      created_at: now,
      updated_at: now,
      ...defaults[type],
      ...overrides,
    }

    setObjects(prev => {
      const next = new Map(prev)
      next.set(id, obj)
      return next
    })

    return obj
  }, [userId])

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>) => {
    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })
  }, [])

  const deleteObject = useCallback((id: string) => {
    setObjects(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const selectObject = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  return {
    objects,
    selectedId,
    addObject,
    updateObject,
    deleteObject,
    selectObject,
    COLOR_PALETTE,
  }
}
