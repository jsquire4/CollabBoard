import type { TipTapDoc, TipTapNode } from '@/types/board'

/** Recursively extract plain text from a TipTap document JSON. */
export function extractPlainText(doc: TipTapDoc): string {
  const lines: string[] = []

  function walkNode(node: TipTapNode): string {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'

    const childTexts = (node.content ?? []).map(walkNode)
    return childTexts.join('')
  }

  for (const block of doc.content ?? []) {
    lines.push(walkNode(block))
  }

  return lines.join('\n')
}

/** Wrap plain text into a minimal TipTap document JSON. */
export function plainTextToTipTap(text: string): TipTapDoc {
  const paragraphs = (text || '').split('\n')
  return {
    type: 'doc',
    content: paragraphs.map(line => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

/** Check if a rich_text JSON string represents an empty document. */
export function isEmptyRichText(json: string | null | undefined): boolean {
  if (!json) return true
  try {
    const doc = JSON.parse(json) as TipTapDoc
    if (!doc.content || doc.content.length === 0) return true
    return extractPlainText(doc).trim() === ''
  } catch {
    return true
  }
}
