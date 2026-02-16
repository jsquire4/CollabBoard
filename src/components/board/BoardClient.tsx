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
}

export function BoardClient({ userId }: BoardClientProps) {
  const { objects, selectedId, addObject, updateObject, deleteObject, selectObject } = useBoardState(userId)
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

  return (
    <>
      <Toolbar
        onAddStickyNote={handleAddStickyNote}
        onAddRectangle={handleAddRectangle}
        onAddCircle={handleAddCircle}
      />
      <Canvas
        objects={objects}
        selectedId={selectedId}
        onSelect={selectObject}
        onDragEnd={handleDragEnd}
        onUpdateText={handleUpdateText}
        onTransformEnd={handleTransformEnd}
      />
    </>
  )
}
