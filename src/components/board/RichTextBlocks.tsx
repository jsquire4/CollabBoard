'use client'

import React, { useMemo } from 'react'
import { Group, Rect, Text, Line } from 'react-konva'
import { tipTapToBlocks, type Block } from '@/lib/richText/tipTapToBlocks'
import { layoutBlocks, type BlockLayout, type PositionedFragment } from '@/lib/richText/textLayout'
import { plainTextToTipTap } from '@/lib/richText'
import type { TipTapDoc } from '@/types/board'

interface RichTextBlocksProps {
  richText: string | null
  plainText: string
  width: number
  height: number
  x: number
  y: number
  baseFontSize: number
  baseFontFamily: string
  baseColor: string
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  excludeBlockTypes?: Block['type'][]
  onToggleTask?: (blockIndex: number, checked: boolean) => void
}

const CHECKBOX_SIZE = 12

function renderFragment(frag: PositionedFragment, key: string) {
  const fontStyle = [
    frag.italic ? 'italic' : '',
    frag.bold ? 'bold' : '',
  ].filter(Boolean).join(' ') || 'normal'

  return (
    <Text
      key={key}
      x={frag.x}
      y={frag.y}
      width={frag.width + 1} // +1 to avoid Konva clipping last character
      height={frag.height}
      text={frag.text}
      fontSize={frag.fontSize}
      fontFamily={frag.fontFamily}
      fontStyle={fontStyle}
      fill={frag.fill}
      listening={false}
      verticalAlign="top"
    />
  )
}

/** Background decorations: code block bg, highlight rects (render BEFORE text) */
function renderBackgrounds(bl: BlockLayout, key: string, containerWidth: number) {
  const elements: React.ReactNode[] = []

  if (bl.type === 'codeBlock') {
    elements.push(
      <Rect
        key={`${key}-code-bg`}
        x={0}
        y={bl.y}
        width={bl.fragments.length > 0 ? Math.max(...bl.fragments.map(f => f.x + f.width)) + 8 : containerWidth}
        height={bl.height}
        fill="#f3f4f6"
        cornerRadius={4}
        listening={false}
      />
    )
  }

  for (let fi = 0; fi < bl.fragments.length; fi++) {
    const frag = bl.fragments[fi]
    if (frag.highlight) {
      elements.push(
        <Rect
          key={`${key}-hl-${fi}`}
          x={frag.x}
          y={frag.y}
          width={frag.width}
          height={frag.height}
          fill={frag.highlight}
          listening={false}
        />
      )
    }
  }

  return elements
}

/** Foreground decorations: underline, strike, prefix, checkbox, blockquote border (render AFTER text) */
function renderForeground(bl: BlockLayout, key: string, onToggleTask?: (blockIndex: number, checked: boolean) => void) {
  const elements: React.ReactNode[] = []

  for (let fi = 0; fi < bl.fragments.length; fi++) {
    const frag = bl.fragments[fi]
    if (frag.underline) {
      const lineY = frag.y + frag.height - 2
      elements.push(
        <Line
          key={`${key}-ul-${fi}`}
          points={[frag.x, lineY, frag.x + frag.width, lineY]}
          stroke={frag.fill}
          strokeWidth={1}
          listening={false}
        />
      )
    }
    if (frag.strikethrough) {
      const lineY = frag.y + frag.height / 2
      elements.push(
        <Line
          key={`${key}-st-${fi}`}
          points={[frag.x, lineY, frag.x + frag.width, lineY]}
          stroke={frag.fill}
          strokeWidth={1}
          listening={false}
        />
      )
    }
  }

  if (bl.prefixText != null && bl.prefixX != null && bl.prefixY != null) {
    elements.push(
      <Text
        key={`${key}-prefix`}
        x={bl.prefixX}
        y={bl.prefixY}
        text={bl.prefixText}
        fontSize={bl.prefixFontSize ?? 14}
        fontFamily={bl.prefixFontFamily ?? 'sans-serif'}
        fill={bl.prefixFill ?? '#000000'}
        listening={false}
      />
    )
  }

  if (bl.type === 'taskItem' && bl.checkboxX != null && bl.checkboxY != null) {
    elements.push(
      <Group
        key={`${key}-cb`}
        x={bl.checkboxX}
        y={bl.checkboxY}
        listening={true}
        onClick={(e) => {
          e.cancelBubble = true
          onToggleTask?.(bl.blockIndex, !bl.checked)
        }}
        onTap={(e) => {
          e.cancelBubble = true
          onToggleTask?.(bl.blockIndex, !bl.checked)
        }}
      >
        <Rect
          width={CHECKBOX_SIZE}
          height={CHECKBOX_SIZE}
          stroke="#6b7280"
          strokeWidth={1.5}
          cornerRadius={2}
          fill={bl.checked ? '#3b82f6' : 'transparent'}
        />
        {bl.checked && (
          <Line
            points={[2.5, 6, 5, 9, 9.5, 3]}
            stroke="#ffffff"
            strokeWidth={1.5}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}
      </Group>
    )
  }

  if (bl.type === 'blockquote') {
    elements.push(
      <Rect
        key={`${key}-bq`}
        x={0}
        y={bl.y}
        width={3}
        height={bl.height}
        fill="#9ca3af"
        listening={false}
      />
    )
  }

  return elements
}

export const RichTextBlocks = React.memo(function RichTextBlocks({
  richText,
  plainText,
  width,
  height,
  x,
  y,
  baseFontSize,
  baseFontFamily,
  baseColor,
  align,
  verticalAlign = 'top',
  lineHeight,
  excludeBlockTypes,
  onToggleTask,
}: RichTextBlocksProps) {
  const { blockLayouts, totalHeight } = useMemo(() => {
    let doc: TipTapDoc
    if (richText) {
      try {
        doc = JSON.parse(richText) as TipTapDoc
      } catch {
        doc = plainTextToTipTap(plainText)
      }
    } else {
      doc = plainTextToTipTap(plainText)
    }

    const filter = excludeBlockTypes?.length ? { excludeTypes: excludeBlockTypes } : undefined
    const blocks = tipTapToBlocks(doc, filter)
    return layoutBlocks(blocks, {
      width,
      height,
      baseFontSize,
      baseFontFamily,
      baseColor,
      baseAlign: align,
      lineHeight,
    })
  }, [richText, plainText, width, height, baseFontSize, baseFontFamily, baseColor, align, lineHeight, excludeBlockTypes])

  const offsetY = verticalAlign === 'middle'
    ? Math.max(0, (height - totalHeight) / 2)
    : verticalAlign === 'bottom'
      ? Math.max(0, height - totalHeight)
      : 0

  return (
    <Group
      x={x}
      y={y}
      clipX={0}
      clipY={0}
      clipWidth={width}
      clipHeight={height}
    >
      <Group y={offsetY}>
        {blockLayouts.map((bl, bi) => {
          const key = `b${bi}`
          return (
            <React.Fragment key={key}>
              {renderBackgrounds(bl, key, width)}
              {bl.fragments.map((frag, fi) => renderFragment(frag, `${key}-f${fi}`))}
              {renderForeground(bl, key, onToggleTask)}
            </React.Fragment>
          )
        })}
      </Group>
    </Group>
  )
})
