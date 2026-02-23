import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { layoutBlocks, _injectMeasureText } from './textLayout'
import type { Block } from './tipTapToBlocks'

// Mock measureText: each character is 8px wide
const CHAR_WIDTH = 8
function mockMeasure(text: string, _font: string) {
  return { width: text.length * CHAR_WIDTH }
}

describe('layoutBlocks', () => {
  beforeEach(() => {
    _injectMeasureText(mockMeasure)
  })

  afterEach(() => {
    _injectMeasureText(null)
  })

  const baseOptions = {
    width: 200,
    height: 400,
    baseFontSize: 14,
    baseFontFamily: 'sans-serif',
    baseColor: '#000000',
    lineHeight: 1.4,
  }

  it('lays out a single run on one line', () => {
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [{ text: 'Hello' }],
    }]
    const { blockLayouts, totalHeight } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts).toHaveLength(1)
    expect(blockLayouts[0].fragments).toHaveLength(1)
    expect(blockLayouts[0].fragments[0].x).toBe(0)
    expect(blockLayouts[0].fragments[0].y).toBe(0)
    expect(totalHeight).toBeCloseTo(14 * 1.4)
  })

  it('word-wraps when text exceeds width', () => {
    // 200px wide, each char 8px → ~25 chars per line
    // "aaaaaaaaaa bbbbbbbbbb cccccccccc" → 3 words of 10 chars = 80px each
    // 80 + 8(space) + 80 = 168 fits, + 8(space) + 80 = 256 doesn't
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [{ text: 'aaaaaaaaaa bbbbbbbbbb cccccccccc' }],
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    const frags = blockLayouts[0].fragments
    // Should have at least two different y positions (wrapped)
    const yValues = new Set(frags.map(f => f.y))
    expect(yValues.size).toBeGreaterThanOrEqual(2)
  })

  it('handles mixed font sizes', () => {
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [
        { text: 'Small', fontSize: 12 },
        { text: ' ' },
        { text: 'Big', fontSize: 24 },
      ],
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].fragments[0].fontSize).toBe(12)
    // fragments[1] is the space, fragments[2] is "Big"
    const bigFrag = blockLayouts[0].fragments.find(f => f.text === 'Big')
    expect(bigFrag?.fontSize).toBe(24)
  })

  it('handles empty text', () => {
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [],
    }]
    const { blockLayouts, totalHeight } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts).toHaveLength(1)
    expect(blockLayouts[0].fragments).toHaveLength(0)
    expect(totalHeight).toBeGreaterThan(0)
  })

  it('applies center alignment', () => {
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [{ text: 'Hi' }],
      align: 'center',
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    const frag = blockLayouts[0].fragments[0]
    // "Hi" = 2 chars = 16px. Remaining = 200 - 16 = 184. Center shift = 92.
    expect(frag.x).toBeCloseTo(92)
  })

  it('applies right alignment', () => {
    const blocks: Block[] = [{
      type: 'paragraph',
      runs: [{ text: 'Hi' }],
      align: 'right',
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    const frag = blockLayouts[0].fragments[0]
    // "Hi" = 16px. Right shift = 200 - 16 = 184.
    expect(frag.x).toBeCloseTo(184)
  })

  it('indents bullet items', () => {
    const blocks: Block[] = [{
      type: 'bulletItem',
      runs: [{ text: 'Item' }],
      level: 0,
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    // Indent for level 0 bullet = 20
    expect(blockLayouts[0].indent).toBe(20)
    expect(blockLayouts[0].fragments[0].x).toBe(20)
    expect(blockLayouts[0].prefixText).toBe('\u2022')
  })

  it('indents nested bullet items', () => {
    const blocks: Block[] = [{
      type: 'bulletItem',
      runs: [{ text: 'Nested' }],
      level: 1,
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].indent).toBe(40) // BULLET_INDENT * (1 + 1)
  })

  it('indents blockquote', () => {
    const blocks: Block[] = [{
      type: 'blockquote',
      runs: [{ text: 'Quoted' }],
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].indent).toBe(16)
  })

  it('sets checkbox for task items', () => {
    const blocks: Block[] = [{
      type: 'taskItem',
      runs: [{ text: 'Task' }],
      checked: true,
      level: 0,
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].checked).toBe(true)
    expect(blockLayouts[0].checkboxX).toBeDefined()
    expect(blockLayouts[0].checkboxY).toBeDefined()
  })

  it('uses heading font size for heading blocks', () => {
    const blocks: Block[] = [{
      type: 'heading',
      runs: [{ text: 'Title' }],
      level: 1,
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].fragments[0].fontSize).toBe(24)
  })

  it('computes correct totalHeight for multiple blocks', () => {
    const blocks: Block[] = [
      { type: 'paragraph', runs: [{ text: 'Line 1' }] },
      { type: 'paragraph', runs: [{ text: 'Line 2' }] },
    ]
    const { totalHeight } = layoutBlocks(blocks, baseOptions)
    expect(totalHeight).toBeCloseTo(14 * 1.4 * 2)
  })

  it('sets ordered item prefix text', () => {
    const blocks: Block[] = [{
      type: 'orderedItem',
      runs: [{ text: 'Item' }],
      orderIndex: 3,
      level: 0,
    }]
    const { blockLayouts } = layoutBlocks(blocks, baseOptions)
    expect(blockLayouts[0].prefixText).toBe('3.')
  })
})
