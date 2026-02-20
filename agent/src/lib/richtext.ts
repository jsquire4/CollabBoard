/**
 * Rich text utilities — inlined from src/lib/richText.ts.
 * Only plainTextToTipTap needed by the agent.
 */

import type { TipTapDoc } from '../types.js'

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
