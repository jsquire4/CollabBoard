/**
 * Parse TipTap JSON → flat Block[] with typed StyledRun[] content.
 * Used by the native Konva text renderer (RichTextBlocks).
 */

import type { TipTapDoc, TipTapNode, TipTapMark } from '@/types/board'

export interface StyledRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string
  highlight?: string
  fontFamily?: string
  fontSize?: number
}

export interface Block {
  type: 'paragraph' | 'heading' | 'bulletItem' | 'orderedItem' | 'taskItem' | 'blockquote' | 'codeBlock'
  runs: StyledRun[]
  level?: number          // heading 1-3, list nesting
  checked?: boolean       // taskItem
  align?: 'left' | 'center' | 'right'
  orderIndex?: number     // orderedItem: 1-based
}

function extractMarks(marks?: TipTapMark[]): Partial<StyledRun> {
  if (!marks || marks.length === 0) return {}
  const result: Partial<StyledRun> = {}
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result.bold = true
        break
      case 'italic':
        result.italic = true
        break
      case 'underline':
        result.underline = true
        break
      case 'strike':
        result.strikethrough = true
        break
      case 'textStyle': {
        const attrs = mark.attrs ?? {}
        if (attrs.color) result.color = attrs.color as string
        if (attrs.fontFamily) result.fontFamily = attrs.fontFamily as string
        if (attrs.fontSize) {
          const raw = attrs.fontSize
          result.fontSize = typeof raw === 'string' ? parseFloat(raw) : (raw as number)
        }
        break
      }
      case 'highlight': {
        const attrs = mark.attrs ?? {}
        if (attrs.color) result.highlight = attrs.color as string
        break
      }
      case 'link':
        result.underline = true
        result.color = result.color ?? '#1B6AC9'
        break
    }
  }
  return result
}

function extractRuns(content?: TipTapNode[]): StyledRun[] {
  if (!content) return []
  const runs: StyledRun[] = []
  for (const node of content) {
    if (node.type === 'text') {
      runs.push({
        text: node.text ?? '',
        ...extractMarks(node.marks),
      })
    } else if (node.type === 'hardBreak') {
      runs.push({ text: '\n' })
    }
  }
  return runs
}

function extractAlign(attrs?: Record<string, unknown>): 'left' | 'center' | 'right' | undefined {
  if (!attrs?.textAlign) return undefined
  const a = attrs.textAlign as string
  if (a === 'center' || a === 'right') return a
  return 'left'
}

function walkListItems(
  listNode: TipTapNode,
  blockType: 'bulletItem' | 'orderedItem' | 'taskItem',
  blocks: Block[],
  nestLevel: number,
) {
  let orderCounter = 1
  for (const item of listNode.content ?? []) {
    if (item.type === 'listItem' || item.type === 'taskItem') {
      // Each list item may contain paragraphs and nested lists
      const runs: StyledRun[] = []
      for (const child of item.content ?? []) {
        if (child.type === 'paragraph') {
          runs.push(...extractRuns(child.content))
        } else if (child.type === 'bulletList') {
          // First push the current item, then recurse
          // Skip: handled after the loop below
        } else if (child.type === 'orderedList') {
          // Skip: handled after loop
        } else if (child.type === 'taskList') {
          // Skip: handled after loop
        }
      }

      const block: Block = {
        type: blockType,
        runs,
        level: nestLevel,
      }
      if (blockType === 'orderedItem') {
        block.orderIndex = orderCounter++
      }
      if (blockType === 'taskItem') {
        block.checked = item.attrs?.checked === true
      }
      blocks.push(block)

      // Recurse into nested lists
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList') {
          walkListItems(child, 'bulletItem', blocks, nestLevel + 1)
        } else if (child.type === 'orderedList') {
          walkListItems(child, 'orderedItem', blocks, nestLevel + 1)
        } else if (child.type === 'taskList') {
          walkListItems(child, 'taskItem', blocks, nestLevel + 1)
        }
      }
    }
  }
}

export interface BlockFilter {
  excludeTypes?: Block['type'][]
}

export function tipTapToBlocks(doc: TipTapDoc, filter?: BlockFilter): Block[] {
  const blocks: Block[] = []
  if (!doc.content) return blocks

  for (const node of doc.content) {
    switch (node.type) {
      case 'paragraph':
        blocks.push({
          type: 'paragraph',
          runs: extractRuns(node.content),
          align: extractAlign(node.attrs),
        })
        break

      case 'heading':
        blocks.push({
          type: 'heading',
          runs: extractRuns(node.content),
          level: (node.attrs?.level as number) ?? 1,
          align: extractAlign(node.attrs),
        })
        break

      case 'bulletList':
        walkListItems(node, 'bulletItem', blocks, 0)
        break

      case 'orderedList':
        walkListItems(node, 'orderedItem', blocks, 0)
        break

      case 'taskList':
        walkListItems(node, 'taskItem', blocks, 0)
        break

      case 'blockquote':
        // Blockquote contains paragraphs; flatten them as blockquote blocks
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') {
            blocks.push({
              type: 'blockquote',
              runs: extractRuns(child.content),
              align: extractAlign(child.attrs),
            })
          }
        }
        break

      case 'codeBlock':
        blocks.push({
          type: 'codeBlock',
          runs: extractRuns(node.content),
        })
        break
    }
  }

  if (filter?.excludeTypes?.length) {
    return blocks.filter(b => !filter.excludeTypes!.includes(b.type))
  }
  return blocks
}
