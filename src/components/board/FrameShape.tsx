import { memo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ShapeProps, handleShapeTransformEnd, getShadowProps, areShapePropsEqual } from './shapeUtils'
import { RichTextBlocks } from './RichTextBlocks'
import type { Block } from '@/lib/richText/tipTapToBlocks'

const TITLE_EXCLUDE_TYPES: Block['type'][] = ['bulletItem', 'orderedItem', 'taskItem']

interface FrameShapeProps extends ShapeProps {
  onStartEdit: (id: string, node: Konva.Text | null, field?: 'text' | 'title') => void
  isEditing?: boolean
}

// Cached offscreen canvas to avoid DOM allocation on every call
let _measureCanvas: HTMLCanvasElement | null = null

/** Measure wrapped text height using an offscreen canvas for accurate word-break metrics. */
function measureWrappedHeight(
  text: string, fontSize: number, fontStyle: string, fontFamily: string,
  maxWidth: number, lineHeight: number
): number {
  if (typeof document === 'undefined') return fontSize * lineHeight
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas')
  const ctx = _measureCanvas.getContext('2d')
  if (!ctx) return fontSize * lineHeight
  ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`
  const words = text.split(/\s+/)
  let lines = 1
  let currentLine = ''
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines++
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  return lines * fontSize * lineHeight
}

export const FrameShape = memo(function FrameShape({
  object,
  onDragEnd,
  isSelected,
  onSelect,
  onStartEdit,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  onDragMove,
  onDragStart,
  editable = true,
  dragBoundFunc,
  isEditing = false,
}: FrameShapeProps) {
  const handleDragStart = () => onDragStart?.(object.id)

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(object.id, e.target.x(), e.target.y())
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(object.id, e.target.x(), e.target.y())
  }

  const handleClick = () => {
    onSelect(object.id)
  }

  const handleDblClick = () => {
    onStartEdit(object.id, null, 'text')
  }

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    handleShapeTransformEnd(e, object, onTransformEnd)
  }

  const titleFontSize = 13
  const titlePadX = 10
  const titlePadY = 6
  const titleLineHeight = 1.3
  const availableWidth = Math.max(1, object.width - titlePadX * 2)
  const titleText = object.text || 'Frame'

  const textHeight = measureWrappedHeight(titleText, titleFontSize, 'bold', 'sans-serif', availableWidth, titleLineHeight)
  const naturalHeight = titlePadY + textHeight + titlePadY
  const maxTitleHeight = object.height * 0.4
  const titleHeight = Math.max(28, Math.min(naturalHeight, maxTitleHeight))

  const shadow = getShadowProps(object)

  // Frame uses its own border logic: dashed border when not selected, solid selection border
  const borderStroke = isSelected ? '#1B3A6B' : (object.stroke_color || 'rgba(232,227,218,0.65)')
  const borderWidth = isSelected ? 2 : (object.stroke_color ? (object.stroke_width ?? 1) : 1)
  const borderDash = isSelected ? undefined : (object.stroke_color ? undefined : [8, 4])

  return (
    <Group
      ref={(node) => shapeRef(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={editable}
      dragBoundFunc={dragBoundFunc}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onTransformEnd={handleTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        onContextMenu(object.id, e.evt.clientX, e.evt.clientY)
      }}
      opacity={object.opacity ?? 1}
    >
      {/* Background fill */}
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color || 'rgba(250,248,244,0.85)'}
        cornerRadius={8}
        stroke={borderStroke}
        strokeWidth={borderWidth}
        dash={borderDash}
        {...shadow}
      />
      {/* Title bar background */}
      <Rect
        width={object.width}
        height={titleHeight}
        fill="rgba(232,227,218,0.18)"
        cornerRadius={[8, 8, 0, 0]}
      />
      {/* Title text — hidden during editing to avoid duplication with textarea overlay */}
      {!isEditing && (
        <RichTextBlocks
          richText={object.rich_text ?? null}
          plainText={titleText}
          x={titlePadX}
          y={titlePadY}
          width={availableWidth}
          height={titleHeight - titlePadY}
          baseFontSize={titleFontSize}
          baseFontFamily="sans-serif"
          baseColor={object.text_color ?? 'rgba(28,28,30,0.55)'}
          align={object.text_align as 'left' | 'center' | 'right' | undefined ?? 'left'}
          verticalAlign="middle"
          excludeBlockTypes={TITLE_EXCLUDE_TYPES}
        />
      )}
      {/* Slide badge — shown when this frame is a slide */}
      {object.is_slide === true && (
        <>
          <Rect
            x={object.width - 36}
            y={4}
            width={32}
            height={20}
            fill="#1C1C1E"
            cornerRadius={4}
            listening={false}
          />
          <Text
            x={object.width - 36}
            y={4}
            width={32}
            height={20}
            text={String(object.slide_index ?? '')}
            fontSize={11}
            fontFamily="sans-serif"
            fontStyle="bold"
            fill="white"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </>
      )}
    </Group>
  )
}, areShapePropsEqual)
