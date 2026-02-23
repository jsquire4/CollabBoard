import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { RichTextBlocks } from './RichTextBlocks'
import { _injectMeasureText } from '@/lib/richText/textLayout'

// Mock react-konva to render simple divs for testing
vi.mock('react-konva', () => ({
  Group: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'konva-group', ...props }, children as React.ReactNode),
  Rect: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'konva-rect', ...props }),
  Text: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'konva-text', ...props }),
  Line: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'konva-line', ...props }),
}))

// Simple mock: each char = 8px
function mockMeasure(text: string) {
  return { width: text.length * 8 }
}

const baseProps = {
  width: 200,
  height: 100,
  x: 0,
  y: 0,
  baseFontSize: 14,
  baseFontFamily: 'sans-serif',
  baseColor: '#000000',
}

describe('RichTextBlocks', () => {
  beforeEach(() => {
    _injectMeasureText(mockMeasure)
  })

  afterEach(() => {
    _injectMeasureText(null)
  })

  it('renders plain text when richText is null', () => {
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: null,
        plainText: 'Hello world',
      })
    )

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    expect(textNodes.length).toBeGreaterThan(0)
    const texts = Array.from(textNodes).map(n => n.getAttribute('text')).filter(Boolean)
    expect(texts.join(' ')).toContain('Hello')
  })

  it('renders richText JSON when provided', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich text' }] }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: 'fallback',
      })
    )

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    const texts = Array.from(textNodes).map(n => n.getAttribute('text')).filter(Boolean)
    expect(texts.some(t => t!.includes('Rich'))).toBe(true)
  })

  it('falls back to plainText on invalid JSON', () => {
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: 'not valid json',
        plainText: 'fallback text',
      })
    )

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    const texts = Array.from(textNodes).map(n => n.getAttribute('text')).filter(Boolean)
    expect(texts.some(t => t!.includes('fallback'))).toBe(true)
  })

  it('renders bold text with correct fontStyle', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }],
      }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: '',
      })
    )

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    const boldNode = Array.from(textNodes).find(n => n.getAttribute('text') === 'Bold')
    expect(boldNode).toBeDefined()
    // React spreads unknown props as lowercase attributes on divs
    // Check all attributes to find where fontStyle ended up
    const attrs = Array.from(boldNode!.attributes).map(a => `${a.name}=${a.value}`)
    expect(attrs.some(a => a.includes('bold'))).toBe(true)
  })

  it('renders bullet list prefix', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }],
        }],
      }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: '',
      })
    )

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    const texts = Array.from(textNodes).map(n => n.getAttribute('text'))
    expect(texts).toContain('\u2022') // bullet character
    expect(texts).toContain('Item')
  })

  it('renders task checkbox', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }],
        }],
      }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: '',
      })
    )

    // Checked checkbox renders a blue rect fill + checkmark line
    const rects = container.querySelectorAll('[data-testid="konva-rect"]')
    const blueRect = Array.from(rects).find(r => r.getAttribute('fill') === '#3b82f6')
    expect(blueRect).toBeDefined()

    const textNodes = container.querySelectorAll('[data-testid="konva-text"]')
    const texts = Array.from(textNodes).map(n => n.getAttribute('text'))
    expect(texts).toContain('Done')
  })

  it('renders highlighted text with background rect', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Yellow',
          marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }],
        }],
      }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: '',
      })
    )

    const rects = container.querySelectorAll('[data-testid="konva-rect"]')
    const hlRect = Array.from(rects).find(r => r.getAttribute('fill') === '#fef08a')
    expect(hlRect).toBeDefined()
  })

  it('renders blockquote with left border', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }],
      }],
    }
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: JSON.stringify(doc),
        plainText: '',
      })
    )

    // Blockquote border is a gray rect with width=3
    const rects = container.querySelectorAll('[data-testid="konva-rect"]')
    const borderRect = Array.from(rects).find(r => r.getAttribute('fill') === '#9ca3af')
    expect(borderRect).toBeDefined()
  })

  it('clips content to container dimensions', () => {
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: null,
        plainText: 'Test',
        x: 10,
        y: 20,
      })
    )

    const group = container.querySelector('[data-testid="konva-group"]')
    expect(group).toBeDefined()
    expect(group!.getAttribute('clipwidth')).toBe('200')
    expect(group!.getAttribute('clipheight')).toBe('100')
  })

  it('renders empty content without errors', () => {
    const { container } = render(
      React.createElement(RichTextBlocks, {
        ...baseProps,
        richText: null,
        plainText: '',
      })
    )

    // Should render the outer group even with empty content
    const groups = container.querySelectorAll('[data-testid="konva-group"]')
    expect(groups.length).toBeGreaterThanOrEqual(1)
  })
})
