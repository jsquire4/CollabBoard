import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { RichTextStaticLayer } from './RichTextStaticLayer'
import { makeRichTextObject, makeRectangle } from '@/test/boardObjectFactory'

// Mock generateStaticHTML to avoid TipTap dependency in tests
vi.mock('@/lib/richText', async () => {
  const actual = await vi.importActual<typeof import('@/lib/richText')>('@/lib/richText')
  return {
    ...actual,
    RICH_TEXT_ENABLED: true,
    generateStaticHTML: vi.fn((json: string) => {
      try {
        const doc = JSON.parse(json)
        const text = doc.content?.[0]?.content?.[0]?.text ?? ''
        return `<p>${text}</p>`
      } catch { return '' }
    }),
  }
})

describe('RichTextStaticLayer', () => {
  const defaultProps = {
    editingId: null,
    stagePos: { x: 50, y: 100 },
    stageScale: 1.5,
  }

  it('renders nothing when no objects have rich_text', () => {
    const obj = makeRectangle({ text: 'plain' })
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj]} {...defaultProps} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders container with correct CSS transform', () => {
    const obj = makeRichTextObject()
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj]} {...defaultProps} />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.transform).toBe('translate(50px, 100px) scale(1.5)')
    expect(wrapper.style.transformOrigin).toBe('0 0')
  })

  it('renders N children for N objects with rich_text', () => {
    const obj1 = makeRichTextObject({ id: 'a' })
    const obj2 = makeRichTextObject({ id: 'b' })
    const obj3 = makeRectangle({ id: 'c' }) // no rich_text
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj1, obj2, obj3]} {...defaultProps} />
    )
    const wrapper = container.firstChild as HTMLElement
    // Only 2 children (obj1, obj2 have rich_text)
    expect(wrapper.children.length).toBe(2)
  })

  it('hides editing shape overlay with opacity 0', () => {
    const obj = makeRichTextObject({ id: 'editing-shape' })
    const { container } = render(
      <RichTextStaticLayer
        visibleObjects={[obj]}
        {...defaultProps}
        editingId="editing-shape"
      />
    )
    const overlay = (container.firstChild as HTMLElement).firstChild as HTMLElement
    expect(overlay.style.opacity).toBe('0')
  })

  it('shows non-editing shape overlay with opacity 1', () => {
    const obj = makeRichTextObject({ id: 'some-shape' })
    const { container } = render(
      <RichTextStaticLayer
        visibleObjects={[obj]}
        {...defaultProps}
        editingId={null}
      />
    )
    const overlay = (container.firstChild as HTMLElement).firstChild as HTMLElement
    expect(overlay.style.opacity).toBe('1')
  })

  it('positions overlay at shape canvas-space coordinates', () => {
    const obj = makeRichTextObject({ x: 200, y: 300, width: 120, height: 80 })
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj]} {...defaultProps} />
    )
    const overlay = (container.firstChild as HTMLElement).firstChild as HTMLElement
    expect(overlay.style.left).toContain('208') // x + padding(8)
    expect(overlay.style.top).toContain('308') // y + padding(8)
  })

  it('renders HTML content', () => {
    const obj = makeRichTextObject()
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj]} {...defaultProps} />
    )
    const overlay = (container.firstChild as HTMLElement).firstChild as HTMLElement
    expect(overlay.innerHTML).toContain('<p>')
  })

  it('has pointer-events none on container', () => {
    const obj = makeRichTextObject()
    const { container } = render(
      <RichTextStaticLayer visibleObjects={[obj]} {...defaultProps} />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.pointerEvents).toBe('none')
  })

  it('hides overlay for shapes being transformed', () => {
    const obj = makeRichTextObject({ id: 'resizing-shape' })
    const { container } = render(
      <RichTextStaticLayer
        visibleObjects={[obj]}
        {...defaultProps}
        transformingIds={new Set(['resizing-shape'])}
      />
    )
    const overlay = (container.firstChild as HTMLElement).firstChild as HTMLElement
    expect(overlay.style.opacity).toBe('0')
  })
})
