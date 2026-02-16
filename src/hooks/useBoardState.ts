'use client'

import { useState, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { BoardObject, BoardObjectType } from '@/types/board'
import { createClient } from '@/lib/supabase/client'

const COLOR_PALETTE = ['#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50']

export function useBoardState(userId: string, boardId: string) {
  const [objects, setObjects] = useState<Map<string, BoardObject>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const supabase = createClient()

  // Load existing objects from Supabase on mount
  useEffect(() => {
    async function loadObjects() {
      const { data, error } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)

      if (error) {
        console.error('Failed to load board objects:', error.message)
        setLoaded(true)
        return
      }

      const map = new Map<string, BoardObject>()
      for (const obj of data ?? []) {
        map.set(obj.id, obj as BoardObject)
      }
      setObjects(map)
      setLoaded(true)
    }

    loadObjects()
  }, [boardId])

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
      board_id: boardId,
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

    // Persist to Supabase
    const { id: _id, created_at, updated_at, ...insertData } = obj
    supabase
      .from('board_objects')
      .insert({ ...insertData, id: obj.id })
      .then(({ error }) => {
        if (error) console.error('Failed to save object:', error.message)
      })

    return obj
  }, [userId, boardId, supabase])

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>) => {
    setObjects(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() })
      return next
    })

    // Persist to Supabase
    supabase
      .from('board_objects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to update object:', error.message)
      })
  }, [supabase])

  const deleteObject = useCallback((id: string) => {
    setObjects(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (selectedId === id) setSelectedId(null)

    // Persist to Supabase
    supabase
      .from('board_objects')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to delete object:', error.message)
      })
  }, [selectedId, supabase])

  const duplicateObject = useCallback((id: string) => {
    const original = objects.get(id)
    if (!original) return null
    const newObj = addObject(original.type, original.x + 20, original.y + 20, {
      color: original.color,
      width: original.width,
      height: original.height,
      rotation: original.rotation,
      text: original.text,
      font_size: original.font_size,
    })
    setSelectedId(newObj.id)
    return newObj
  }, [objects, addObject])

  const selectObject = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  return {
    objects,
    selectedId,
    loaded,
    addObject,
    updateObject,
    deleteObject,
    duplicateObject,
    selectObject,
    COLOR_PALETTE,
  }
}
