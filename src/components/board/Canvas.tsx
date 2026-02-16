'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Transformer } from 'react-konva'
import Konva from 'konva'
import { useCanvas } from '@/hooks/useCanvas'
import { useShiftKey } from '@/hooks/useShiftKey'
import { BoardObject } from '@/types/board'
import { StickyNote } from './StickyNote'
import { RectangleShape } from './RectangleShape'
import { CircleShape } from './CircleShape'

interface CanvasProps {
  objects: Map<string, BoardObject>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onUpdateText: (id: string, text: string) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
}

export function Canvas({ objects, selectedId, onSelect, onDragEnd, onUpdateText, onTransformEnd }: CanvasProps) {
  const { stagePos, stageScale, handleWheel, handleDragEnd: handleStageDragEnd } = useCanvas()
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const shiftHeld = useShiftKey()

  // Textarea overlay state for editing sticky notes
  const [editingId, setEditingId] = useState<string | null>(null)
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({})
  const [editText, setEditText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Ref callback for shape registration
  const handleShapeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      shapeRefs.current.set(id, node)
    } else {
      shapeRefs.current.delete(id)
    }
  }, [])

  // Attach/detach Transformer to selected shape
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return

    if (selectedId && !editingId) {
      const node = shapeRefs.current.get(selectedId)
      if (node) {
        tr.nodes([node])

        // Circle: always keep ratio, corner anchors only
        const obj = objects.get(selectedId)
        if (obj?.type === 'circle') {
          tr.keepRatio(true)
          tr.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
        } else {
          tr.keepRatio(shiftHeld)
          tr.enabledAnchors([
            'top-left', 'top-center', 'top-right',
            'middle-left', 'middle-right',
            'bottom-left', 'bottom-center', 'bottom-right',
          ])
        }

        tr.getLayer()?.batchDraw()
        return
      }
    }

    tr.nodes([])
    tr.getLayer()?.batchDraw()
  }, [selectedId, editingId, objects, shiftHeld])

  const handleStartEdit = useCallback((id: string, textNode: Konva.Text) => {
    const stage = stageRef.current
    if (!stage) return

    const obj = objects.get(id)
    if (!obj) return

    // Get the absolute position of the text node on screen
    const textRect = textNode.getClientRect()

    setEditingId(id)
    setEditText(obj.text || '')
    setTextareaStyle({
      position: 'absolute',
      top: `${textRect.y}px`,
      left: `${textRect.x}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      fontSize: `${obj.font_size * stageScale}px`,
      fontFamily: 'sans-serif',
      padding: '0px',
      margin: '0px',
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      color: '#333',
      overflow: 'hidden',
      lineHeight: '1.2',
      zIndex: 100,
    })
  }, [objects, stageScale])

  const handleFinishEdit = useCallback(() => {
    if (editingId) {
      onUpdateText(editingId, editText)
      setEditingId(null)
    }
  }, [editingId, editText, onUpdateText])

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingId])

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Clicked on empty area — deselect
    if (e.target === e.target.getStage()) {
      onSelect(null)
    }
  }, [onSelect])

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const updateSize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const objectArray = Array.from(objects.values())

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={true}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {objectArray.map(obj => {
            switch (obj.type) {
              case 'sticky_note':
                return (
                  <StickyNote
                    key={obj.id}
                    object={obj}
                    onDragEnd={onDragEnd}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    onStartEdit={handleStartEdit}
                    shapeRef={handleShapeRef}
                    onTransformEnd={onTransformEnd}
                  />
                )
              case 'rectangle':
                return (
                  <RectangleShape
                    key={obj.id}
                    object={obj}
                    onDragEnd={onDragEnd}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    shapeRef={handleShapeRef}
                    onTransformEnd={onTransformEnd}
                  />
                )
              case 'circle':
                return (
                  <CircleShape
                    key={obj.id}
                    object={obj}
                    onDragEnd={onDragEnd}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    shapeRef={handleShapeRef}
                    onTransformEnd={onTransformEnd}
                  />
                )
              default:
                return null
            }
          })}
          <Transformer
            ref={trRef}
            rotateEnabled={true}
            boundBoxFunc={(_oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) {
                return _oldBox
              }
              return newBox
            }}
          />
        </Layer>
      </Stage>

      {/* Textarea overlay for editing sticky note text */}
      {editingId && (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={e => {
            if (e.key === 'Escape') handleFinishEdit()
          }}
          style={textareaStyle}
        />
      )}
    </div>
  )
}
