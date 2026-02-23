/**
 * Text layout engine: given Block[] + container dimensions, compute exact pixel
 * positions for every text fragment using offscreen canvas measurement.
 */

import type { Block, StyledRun } from './tipTapToBlocks'

export interface PositionedFragment {
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
  fill: string
  bold?: boolean
  italic?: boolean
  fontSize: number
  fontFamily: string
  underline?: boolean
  strikethrough?: boolean
  highlight?: string
}

export interface BlockLayout {
  blockIndex: number
  type: Block['type']
  fragments: PositionedFragment[]
  y: number
  height: number
  // Block-level decorations
  prefixText?: string
  prefixX?: number
  prefixY?: number
  prefixFont?: string
  prefixFontSize?: number
  prefixFontFamily?: string
  prefixFill?: string
  checked?: boolean
  checkboxX?: number
  checkboxY?: number
  indent: number
}

export interface LayoutOptions {
  width: number
  height: number
  baseFontSize: number
  baseFontFamily: string
  baseColor: string
  baseAlign?: 'left' | 'center' | 'right'
  lineHeight?: number
  padding?: number
}

// Module-level singleton offscreen canvas for measureText
let _measureCanvas: OffscreenCanvas | null = null
let _measureCtx: OffscreenCanvasRenderingContext2D | null = null

function getMeasureCtx(): OffscreenCanvasRenderingContext2D {
  if (!_measureCtx) {
    _measureCanvas = new OffscreenCanvas(1, 1)
    _measureCtx = _measureCanvas.getContext('2d')!
  }
  return _measureCtx
}

// Allow injection for testing
let _injectedMeasure: ((text: string, font: string) => { width: number }) | null = null

export function _injectMeasureText(fn: ((text: string, font: string) => { width: number }) | null) {
  _injectedMeasure = fn
}

function measureText(text: string, font: string): { width: number } {
  if (_injectedMeasure) return _injectedMeasure(text, font)
  const ctx = getMeasureCtx()
  ctx.font = font
  return { width: ctx.measureText(text).width }
}

function buildFont(run: StyledRun, baseFontSize: number, baseFontFamily: string): string {
  const style = run.italic ? 'italic' : 'normal'
  const weight = run.bold ? 'bold' : 'normal'
  const size = run.fontSize ?? baseFontSize
  const family = run.fontFamily ?? baseFontFamily
  return `${style} ${weight} ${size}px ${family}`
}

const BULLET_INDENT = 20
const BLOCKQUOTE_INDENT = 16
const TASK_CHECKBOX_SIZE = 12
const TASK_CHECKBOX_GAP = 6

const HEADING_SIZES: Record<number, number> = { 1: 24, 2: 20, 3: 18 }

export function layoutBlocks(blocks: Block[], options: LayoutOptions): { blockLayouts: BlockLayout[]; totalHeight: number } {
  const {
    width, baseFontSize, baseFontFamily, baseColor,
    baseAlign = 'left', lineHeight = 1.4,
  } = options

  const blockLayouts: BlockLayout[] = []
  let cursorY = 0

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]
    const isHeading = block.type === 'heading'
    const headingSize = isHeading ? (HEADING_SIZES[block.level ?? 1] ?? baseFontSize) : baseFontSize
    const isCode = block.type === 'codeBlock'
    const isList = block.type === 'bulletItem' || block.type === 'orderedItem' || block.type === 'taskItem'
    const isBlockquote = block.type === 'blockquote'
    const isTask = block.type === 'taskItem'

    const nestLevel = block.level ?? 0
    let indent = 0
    if (isList) indent = BULLET_INDENT * (nestLevel + 1)
    if (isBlockquote) indent = BLOCKQUOTE_INDENT
    if (isTask) indent = BULLET_INDENT * nestLevel + TASK_CHECKBOX_SIZE + TASK_CHECKBOX_GAP + 4

    const availWidth = Math.max(1, width - indent)
    const blockAlign = block.align ?? baseAlign

    const layout: BlockLayout = {
      blockIndex: bi,
      type: block.type,
      fragments: [],
      y: cursorY,
      height: 0,
      indent,
    }

    // Block-level prefix
    if (block.type === 'bulletItem') {
      const prefixFont = `normal normal ${baseFontSize}px ${baseFontFamily}`
      layout.prefixText = '\u2022'
      layout.prefixX = BULLET_INDENT * nestLevel
      layout.prefixY = cursorY
      layout.prefixFont = prefixFont
      layout.prefixFontSize = baseFontSize
      layout.prefixFontFamily = baseFontFamily
      layout.prefixFill = baseColor
    } else if (block.type === 'orderedItem') {
      const prefixFont = `normal normal ${baseFontSize}px ${baseFontFamily}`
      layout.prefixText = `${block.orderIndex ?? 1}.`
      layout.prefixX = BULLET_INDENT * nestLevel
      layout.prefixY = cursorY
      layout.prefixFont = prefixFont
      layout.prefixFontSize = baseFontSize
      layout.prefixFontFamily = baseFontFamily
      layout.prefixFill = baseColor
    } else if (isTask) {
      layout.checked = block.checked
      layout.checkboxX = BULLET_INDENT * nestLevel + 2
      layout.checkboxY = cursorY + 2
    }

    // Layout runs into lines with word wrap
    let lineX = indent
    let lineY = cursorY
    let lineMaxFontSize = isHeading ? headingSize : baseFontSize
    let lineFragments: PositionedFragment[] = []

    function flushLine() {
      // Apply alignment to all fragments in the current line
      const lineWidth = lineX - indent
      const remaining = availWidth - lineWidth
      let shiftX = 0
      if (blockAlign === 'center') shiftX = remaining / 2
      else if (blockAlign === 'right') shiftX = remaining

      if (shiftX > 0) {
        for (const frag of lineFragments) {
          frag.x += shiftX
        }
      }

      const lh = lineMaxFontSize * lineHeight
      for (const frag of lineFragments) {
        frag.height = lh
      }
      layout.fragments.push(...lineFragments)
      lineFragments = []
      lineY += lh
      lineX = indent
      lineMaxFontSize = isHeading ? headingSize : baseFontSize
    }

    for (const run of block.runs) {
      if (run.text === '\n') {
        flushLine()
        continue
      }

      const fontSize = run.fontSize ?? (isHeading ? headingSize : baseFontSize)
      const fontFamily = run.fontFamily ?? (isCode ? 'monospace' : baseFontFamily)
      const font = buildFont(
        { ...run, fontSize, fontFamily, bold: run.bold || isHeading },
        baseFontSize,
        baseFontFamily,
      )
      const fill = run.color ?? baseColor

      // Track max font size for line height
      if (fontSize > lineMaxFontSize) lineMaxFontSize = fontSize

      // Split into words and measure
      const words = run.text.split(/(\s+)/)

      for (const word of words) {
        if (word === '') continue
        const measured = measureText(word, font)
        const wordWidth = measured.width

        // Wrap if needed (but allow at least one word per line)
        if (lineX > indent && lineX + wordWidth > indent + availWidth) {
          flushLine()
          // Don't start new line with whitespace
          if (/^\s+$/.test(word)) continue
        }

        lineFragments.push({
          text: word,
          x: lineX,
          y: lineY,
          width: wordWidth,
          height: 0, // set during flushLine
          font,
          fill,
          bold: run.bold || isHeading,
          italic: run.italic,
          fontSize,
          fontFamily,
          underline: run.underline,
          strikethrough: run.strikethrough,
          highlight: run.highlight,
        })

        lineX += wordWidth
      }
    }

    // Flush remaining fragments
    if (lineFragments.length > 0) {
      flushLine()
    }

    // If block had no content, advance by one line
    if (layout.fragments.length === 0) {
      lineY += baseFontSize * lineHeight
    }

    // Code block: add padding
    if (isCode) {
      lineY += 4 // bottom padding
    }

    layout.height = lineY - cursorY
    cursorY = lineY

    blockLayouts.push(layout)
  }

  return { blockLayouts, totalHeight: cursorY }
}
