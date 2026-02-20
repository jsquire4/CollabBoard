'use client'

import React, { useMemo } from 'react'
import { BoardObject } from '@/types/board'
import { generateStaticHTML, RICH_TEXT_ENABLED } from '@/lib/richText'

interface RichTextStaticLayerProps {
  visibleObjects: BoardObject[]
  editingId: string | null
  transformingIds?: Set<string>
  stagePos: { x: number; y: number }
  stageScale: number
}

export function RichTextStaticLayer({
  visibleObjects,
  editingId,
  transformingIds,
  stagePos,
  stageScale,
}: RichTextStaticLayerProps) {
  const richTextObjects = useMemo(
    () => visibleObjects.filter(obj => obj.rich_text),
    [visibleObjects]
  )

  if (!RICH_TEXT_ENABLED || richTextObjects.length === 0) return null

  return (
    <div
      className="absolute top-0 left-0"
      style={{
        pointerEvents: 'none',
        transform: `translate(${stagePos.x}px, ${stagePos.y}px) scale(${stageScale})`,
        transformOrigin: '0 0',
        zIndex: 1,
      }}
    >
      {richTextObjects.map(obj => (
        <RichTextOverlay
          key={obj.id}
          object={obj}
          isEditing={obj.id === editingId}
          isTransforming={transformingIds?.has(obj.id) ?? false}
        />
      ))}
    </div>
  )
}

interface RichTextOverlayProps {
  object: BoardObject
  isEditing: boolean
  isTransforming: boolean
}

const RichTextOverlay = React.memo(function RichTextOverlay({
  object,
  isEditing,
  isTransforming,
}: RichTextOverlayProps) {
  const html = useMemo(
    () => generateStaticHTML(object.rich_text!),
    [object.rich_text]
  )

  if (!html) return null

  const padding = object.text_padding ?? 8
  // For sticky notes, body starts below the title area
  const isStickyNote = object.type === 'sticky_note'
  const titleHeight = isStickyNote ? 44 : 0 // TITLE_PAD_Y + line + DIVIDER_PAD
  const topOffset = isStickyNote ? titleHeight + 6 : 0

  return (
    <div
      style={{
        position: 'absolute',
        left: object.x + padding,
        top: object.y + topOffset + padding,
        width: object.width - padding * 2,
        height: object.height - topOffset - padding * 2,
        overflow: 'hidden',
        opacity: isEditing || isTransforming ? 0 : 1,
        transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
        transformOrigin: object.rotation
          ? `${-padding}px ${-(topOffset + padding)}px`
          : undefined,
        fontSize: `${object.font_size ?? 16}px`,
        fontFamily: object.font_family ?? 'sans-serif',
        color: object.text_color ?? '#000000',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
