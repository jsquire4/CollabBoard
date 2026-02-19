import { describe, it, expect, vi } from 'vitest'
import { extractPlainText, plainTextToTipTap, generateStaticHTML, isEmptyRichText } from '@/lib/richText'
import type { TipTapDoc } from '@/types/board'

// Use server version of generateHTML in test environment (jsdom doesn't support browser version)
vi.mock('@tiptap/html', async () => {
  const server = await import('@tiptap/html/server')
  return { generateHTML: server.generateHTML }
})

describe('extractPlainText', () => {
  it('extracts text from a simple paragraph', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }
    expect(extractPlainText(doc)).toBe('Hello world')
  })

  it('joins multiple paragraphs with newlines', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
      ],
    }
    expect(extractPlainText(doc)).toBe('Line 1\nLine 2')
  })

  it('handles empty paragraphs', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }
    expect(extractPlainText(doc)).toBe('')
  })

  it('handles nested marks (bold/italic)', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        ],
      }],
    }
    expect(extractPlainText(doc)).toBe('bold and italic')
  })

  it('handles hardBreaks', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Before' },
          { type: 'hardBreak' },
          { type: 'text', text: 'After' },
        ],
      }],
    }
    expect(extractPlainText(doc)).toBe('Before\nAfter')
  })

  it('extracts text from task list items', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: false },
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Todo item' }],
          }],
        }],
      }],
    }
    expect(extractPlainText(doc)).toBe('Todo item')
  })

  it('handles empty content array', () => {
    const doc: TipTapDoc = { type: 'doc', content: [] }
    expect(extractPlainText(doc)).toBe('')
  })
})

describe('plainTextToTipTap', () => {
  it('wraps single line in a paragraph', () => {
    const doc = plainTextToTipTap('Hello')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].type).toBe('paragraph')
    expect(doc.content[0].content?.[0].text).toBe('Hello')
  })

  it('wraps multiline text in multiple paragraphs', () => {
    const doc = plainTextToTipTap('Line 1\nLine 2\nLine 3')
    expect(doc.content).toHaveLength(3)
    expect(doc.content[0].content?.[0].text).toBe('Line 1')
    expect(doc.content[2].content?.[0].text).toBe('Line 3')
  })

  it('round-trips through extractPlainText', () => {
    const original = 'Hello\nWorld\n\nThird line'
    const doc = plainTextToTipTap(original)
    expect(extractPlainText(doc)).toBe(original)
  })

  it('handles empty string', () => {
    const doc = plainTextToTipTap('')
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].type).toBe('paragraph')
    expect(doc.content[0].content).toBeUndefined()
  })
})

describe('generateStaticHTML', () => {
  it('returns HTML for a valid doc', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
    const html = generateStaticHTML(JSON.stringify(doc))
    expect(html).toContain('Hello')
    expect(html).toMatch(/<p[\s>]/)
  })

  it('returns empty string for invalid JSON', () => {
    expect(generateStaticHTML('not valid json')).toBe('')
  })

  it('returns empty string for null-ish input', () => {
    expect(generateStaticHTML('')).toBe('')
  })

  it('renders bold marks as <strong>', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }],
      }],
    }
    const html = generateStaticHTML(JSON.stringify(doc))
    expect(html).toContain('Bold')
    expect(html).toMatch(/<strong[\s>]/)
    expect(html).toContain('</strong>')
  })
})

describe('isEmptyRichText', () => {
  it('returns true for null', () => {
    expect(isEmptyRichText(null)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isEmptyRichText('')).toBe(true)
  })

  it('returns true for doc with only empty paragraphs', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(isEmptyRichText(JSON.stringify(doc))).toBe(true)
  })

  it('returns false for doc with text content', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
    expect(isEmptyRichText(JSON.stringify(doc))).toBe(false)
  })

  it('returns true for malformed JSON', () => {
    expect(isEmptyRichText('broken')).toBe(true)
  })

  it('returns true for whitespace-only content', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] }
    expect(isEmptyRichText(JSON.stringify(doc))).toBe(true)
  })
})
