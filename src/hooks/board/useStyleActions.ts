'use client'

import { useCallback } from 'react'
import { BoardObject } from '@/types/board'

interface UseStyleActionsDeps {
  objects: Map<string, BoardObject>
  selectedIds: Set<string>
  canEdit: boolean
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  deleteObject: (id: string) => void
  getDescendants: (id: string) => BoardObject[]
  undoStack: {
    push: (entry: { type: 'update'; patches: { id: string; before: Partial<BoardObject> }[] } | { type: 'delete'; objects: BoardObject[] }) => void
  }
  pushRecentColor: (color: string) => void
}

export function useStyleActions({
  objects,
  selectedIds,
  canEdit,
  updateObject,
  deleteObject,
  getDescendants,
  undoStack,
  pushRecentColor,
}: UseStyleActionsDeps) {
  const checkAndDeleteInvisible = useCallback((pendingChanges: Map<string, Partial<BoardObject>>): BoardObject[] => {
    const deleted: BoardObject[] = []
    for (const [id, changes] of pendingChanges) {
      const obj = objects.get(id)
      if (!obj || obj.type === 'group') continue
      const fill = changes.color ?? obj.color
      const stroke = changes.stroke_color !== undefined ? changes.stroke_color : obj.stroke_color
      const isTransparent = !fill || fill === 'transparent' || fill === 'rgba(0,0,0,0)'
      const hasStroke = !!stroke
      const hasText = !!(obj.text?.trim()) || !!(obj.title?.trim())
      if (isTransparent && !hasStroke && !hasText) {
        deleted.push({ ...obj })
        deleteObject(id)
      }
    }
    return deleted
  }, [objects, deleteObject])

  const handleColorChange = useCallback((color: string) => {
    if (!canEdit) return
    pushRecentColor(color)
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    const pendingChanges = new Map<string, Partial<BoardObject>>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (obj?.type === 'group') {
        for (const child of getDescendants(id)) {
          if (child.type !== 'group') {
            patches.push({ id: child.id, before: { color: child.color } })
            updateObject(child.id, { color })
            pendingChanges.set(child.id, { color })
          }
        }
      } else if (obj) {
        patches.push({ id, before: { color: obj.color } })
        updateObject(id, { color })
        pendingChanges.set(id, { color })
      }
    }
    const deleted = checkAndDeleteInvisible(pendingChanges)
    if (deleted.length > 0) {
      const originalColors = new Map(patches.map(p => [p.id, p.before.color]))
      const restoredObjects = deleted.map(obj => {
        const origColor = originalColors.get(obj.id)
        return origColor !== undefined ? { ...obj, color: origColor } : obj
      })
      undoStack.push({ type: 'delete', objects: restoredObjects })
    } else if (patches.length > 0) {
      undoStack.push({ type: 'update', patches })
    }
  }, [canEdit, selectedIds, objects, getDescendants, updateObject, undoStack, pushRecentColor, checkAndDeleteInvisible])

  const handleStrokeStyleChange = useCallback((updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    const pendingChanges = new Map<string, Partial<BoardObject>>()
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
      pendingChanges.set(id, updates as Partial<BoardObject>)
    }
    const deleted = checkAndDeleteInvisible(pendingChanges)
    if (deleted.length > 0) {
      const originalValues = new Map(patches.map(p => [p.id, p.before]))
      const restoredObjects = deleted.map(obj => {
        const orig = originalValues.get(obj.id)
        return orig ? { ...obj, ...orig } : obj
      })
      undoStack.push({ type: 'delete', objects: restoredObjects })
    } else if (patches.length > 0) {
      undoStack.push({ type: 'update', patches })
    }
  }, [canEdit, selectedIds, objects, updateObject, undoStack, checkAndDeleteInvisible])

  const handleOpacityChange = useCallback((opacity: number) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      patches.push({ id, before: { opacity: obj.opacity ?? 1 } })
      updateObject(id, { opacity })
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleShadowChange = useCallback((updates: { shadow_blur?: number; shadow_color?: string; shadow_offset_x?: number; shadow_offset_y?: number }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleMarkerChange = useCallback((updates: { marker_start?: string; marker_end?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      if (updates.marker_start !== undefined) before.marker_start = obj.marker_start ?? 'none'
      if (updates.marker_end !== undefined) before.marker_end = obj.marker_end ?? 'none'
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleCornerRadiusChange = useCallback((corner_radius: number) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj || obj.type !== 'rectangle') continue
      patches.push({ id, before: { corner_radius: obj.corner_radius ?? 0 } })
      updateObject(id, { corner_radius })
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleTextStyleChange = useCallback((updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      const before: Partial<BoardObject> = {}
      for (const key of Object.keys(updates)) {
        (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
      }
      patches.push({ id, before })
      updateObject(id, updates as Partial<BoardObject>)
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  const handleFontChange = useCallback((updates: { font_family?: string; font_size?: number; font_style?: 'normal' | 'bold' | 'italic' | 'bold italic' }) => {
    if (!canEdit) return
    const patches: { id: string; before: Partial<BoardObject> }[] = []
    for (const id of selectedIds) {
      const obj = objects.get(id)
      if (!obj) continue
      if (obj.type === 'sticky_note' || obj.text) {
        const before: Partial<BoardObject> = {}
        for (const key of Object.keys(updates)) {
          (before as unknown as Record<string, unknown>)[key] = (obj as unknown as Record<string, unknown>)[key]
        }
        patches.push({ id, before })
        updateObject(id, updates)
      }
    }
    if (patches.length > 0) undoStack.push({ type: 'update', patches })
  }, [canEdit, selectedIds, objects, updateObject, undoStack])

  return {
    handleColorChange,
    handleStrokeStyleChange,
    handleOpacityChange,
    handleShadowChange,
    handleMarkerChange,
    handleCornerRadiusChange,
    handleTextStyleChange,
    handleFontChange,
  }
}
