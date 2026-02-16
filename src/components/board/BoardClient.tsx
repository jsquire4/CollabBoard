'use client'

import dynamic from 'next/dynamic'
import { useBoardState } from '@/hooks/useBoardState'
import { useCanvas } from '@/hooks/useCanvas'
import { BoardObject } from '@/types/board'
import { Toolbar } from './Toolbar'

// Konva is client-only — must disable SSR
const Canvas = dynamic(() => import('./Canvas').then(mod => ({ default: mod.Canvas })), {
  ssr: false,
  loading: () => <div style={{ width: '100vw', height: '100vh', background: '#f5f5f5' }} />,
})

interface BoardClientProps {
  userId: string
  boardId: string
  boardName: string
}

export function BoardClient({ userId, boardId, boardName }: BoardClientProps) {
  const {
    objects, selectedId, addObject, updateObject, deleteObject, duplicateObject, selectObject, COLOR_PALETTE,
  } = useBoardState(userId, boardId)
  const { getViewportCenter } = useCanvas()

  const handleAddStickyNote = () => {
    const center = getViewportCenter()
    addObject('sticky_note', center.x - 75, center.y - 75)
  }

  const handleAddRectangle = () => {
    const center = getViewportCenter()
    addObject('rectangle', center.x - 100, center.y - 70)
  }

  const handleAddCircle = () => {
    const center = getViewportCenter()
    addObject('circle', center.x - 60, center.y - 60)
  }

  const handleDragEnd = (id: string, x: number, y: number) => {
    updateObject(id, { x, y })
  }

  const handleUpdateText = (id: string, text: string) => {
    updateObject(id, { text })
  }

  const handleTransformEnd = (id: string, updates: Partial<BoardObject>) => {
    updateObject(id, updates)
  }

  const handleDelete = () => {
    if (selectedId) deleteObject(selectedId)
  }

  const handleDuplicate = () => {
    if (selectedId) duplicateObject(selectedId)
  }

  const handleColorChange = (color: string) => {
    if (selectedId) updateObject(selectedId, { color })
  }

  const selectedColor = selectedId ? objects.get(selectedId)?.color : undefined

  return (
    <>
      <Toolbar
        boardId={boardId}
        boardName={boardName}
        onAddStickyNote={handleAddStickyNote}
        onAddRectangle={handleAddRectangle}
        onAddCircle={handleAddCircle}
        selectedId={selectedId}
        selectedColor={selectedColor}
        colors={COLOR_PALETTE}
        onColorChange={handleColorChange}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />
      <Canvas
        objects={objects}
        selectedId={selectedId}
        onSelect={selectObject}
        onDragEnd={handleDragEnd}
        onUpdateText={handleUpdateText}
        onTransformEnd={handleTransformEnd}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onColorChange={handleColorChange}
        colors={COLOR_PALETTE}
        selectedColor={selectedColor}
      />
    </>
  )
}
