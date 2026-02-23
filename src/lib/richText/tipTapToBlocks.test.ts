import { describe, it, expect } from 'vitest'
import { tipTapToBlocks } from './tipTapToBlocks'
import type { TipTapDoc } from '@/types/board'

describe('tipTapToBlocks', () => {
  it('parses a simple paragraph', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[0].runs).toEqual([{ text: 'Hello world' }])
  })

  it('parses heading levels', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H3' }] },
      ],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 2 })
    expect(blocks[2]).toMatchObject({ type: 'heading', level: 3 })
  })

  it('parses bullet list', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
        ],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'bulletItem', level: 0 })
    expect(blocks[1]).toMatchObject({ type: 'bulletItem', level: 0 })
  })

  it('parses ordered list with orderIndex', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
        ],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'orderedItem', orderIndex: 1 })
    expect(blocks[1]).toMatchObject({ type: 'orderedItem', orderIndex: 2 })
  })

  it('parses task list with checked state', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pending' }] }] },
        ],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'taskItem', checked: true })
    expect(blocks[1]).toMatchObject({ type: 'taskItem', checked: false })
  })

  it('parses blockquote', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted text' }] }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'blockquote' })
    expect(blocks[0].runs[0].text).toBe('Quoted text')
  })

  it('parses code block', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'codeBlock',
        content: [{ type: 'text', text: 'const x = 1' }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('codeBlock')
    expect(blocks[0].runs[0].text).toBe('const x = 1')
  })

  it('extracts mixed inline styles', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'normal ' },
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'underline', marks: [{ type: 'underline' }] },
        ],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs[1]).toMatchObject({ text: 'bold', bold: true })
    expect(blocks[0].runs[3]).toMatchObject({ text: 'italic', italic: true })
    expect(blocks[0].runs[5]).toMatchObject({ text: 'strike', strikethrough: true })
    expect(blocks[0].runs[7]).toMatchObject({ text: 'underline', underline: true })
  })

  it('extracts textStyle marks (color, fontFamily, fontSize)', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'styled',
          marks: [{
            type: 'textStyle',
            attrs: { color: '#ff0000', fontFamily: 'monospace', fontSize: '20px' },
          }],
        }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs[0]).toMatchObject({
      text: 'styled',
      color: '#ff0000',
      fontFamily: 'monospace',
      fontSize: 20,
    })
  })

  it('extracts highlight mark', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'highlighted',
          marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }],
        }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs[0].highlight).toBe('#ffff00')
  })

  it('handles empty doc', () => {
    const doc: TipTapDoc = { type: 'doc', content: [] }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(0)
  })

  it('handles doc with no content', () => {
    const doc = { type: 'doc' } as TipTapDoc
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(0)
  })

  it('extracts text alignment', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Centered' }] },
        { type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'Right' }] },
      ],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].align).toBe('center')
    expect(blocks[1].align).toBe('right')
  })

  it('handles nested bullet lists', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
            {
              type: 'bulletList',
              content: [{
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }],
              }],
            },
          ],
        }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'bulletItem', level: 0 })
    expect(blocks[1]).toMatchObject({ type: 'bulletItem', level: 1 })
  })

  it('filters out excluded block types', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remove me' }] }] },
        ]},
        { type: 'orderedList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remove me too' }] }] },
        ]},
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep task' }] }] },
        ]},
      ],
    }
    const blocks = tipTapToBlocks(doc, { excludeTypes: ['bulletItem', 'orderedItem'] })
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('taskItem')
  })

  it('returns all blocks when no filter is provided', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet' }] }] },
        ]},
      ],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks).toHaveLength(2)
  })

  it('handles hardBreak within a paragraph', () => {
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
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs).toHaveLength(3)
    expect(blocks[0].runs[1].text).toBe('\n')
  })

  it('renders link mark with underline and blue color', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Click ' },
          { type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs).toHaveLength(2)
    expect(blocks[0].runs[1]).toMatchObject({
      text: 'here',
      underline: true,
      color: '#1B6AC9',
    })
  })

  it('link mark does not override explicit text color', () => {
    const doc: TipTapDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'colored link',
          marks: [
            { type: 'textStyle', attrs: { color: '#FF0000' } },
            { type: 'link', attrs: { href: 'https://example.com' } },
          ],
        }],
      }],
    }
    const blocks = tipTapToBlocks(doc)
    expect(blocks[0].runs[0]).toMatchObject({
      text: 'colored link',
      underline: true,
      color: '#FF0000',
    })
  })
})
