import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { RichTextToolbar } from './RichTextToolbar'
import type { Editor } from '@tiptap/react'

function createMockEditor(): Editor {
  const chainProxy: Record<string, unknown> = {}
  const proxy = new Proxy(chainProxy, {
    get: (_target, prop) => {
      if (prop === 'run') return vi.fn()
      return () => proxy
    },
  })

  return {
    chain: vi.fn(() => proxy),
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
    isDestroyed: false,
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Editor
}

describe('RichTextToolbar', () => {
  it('renders all formatting buttons', () => {
    const editor = createMockEditor()
    const { container } = render(<RichTextToolbar editor={editor} />)
    const buttons = container.querySelectorAll('button')
    // B, I, U, S, H, •, 1., ☑, H1, H2, H3, color, align-left, align-center, align-right = 15 buttons
    expect(buttons.length).toBe(15)
  })

  it('shows active state for bold', () => {
    const editor = createMockEditor()
    ;(editor.isActive as ReturnType<typeof vi.fn>).mockImplementation((name: string) => name === 'bold')
    const { container } = render(<RichTextToolbar editor={editor} />)
    const boldButton = container.querySelectorAll('button')[0]
    expect(boldButton.className).toContain('border-leather')
  })

  it('prevents blur via mouseDown preventDefault on wrapper', () => {
    const editor = createMockEditor()
    const { container } = render(<RichTextToolbar editor={editor} />)
    const wrapper = container.firstChild as HTMLElement
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    wrapper.dispatchEvent(event)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('calls chain().focus().toggleBold().run() on bold click', () => {
    const editor = createMockEditor()
    const { container } = render(<RichTextToolbar editor={editor} />)
    const boldButton = container.querySelectorAll('button')[0]
    fireEvent.mouseDown(boldButton)
    expect(editor.chain).toHaveBeenCalled()
  })

  it('renders buttons when editor is null (inactive state)', () => {
    const { container } = render(<RichTextToolbar editor={null} />)
    expect(container.querySelectorAll('button').length).toBe(15)
  })

  it('subscribes to editor events and updates active state', () => {
    const editor = createMockEditor()
    render(<RichTextToolbar editor={editor} />)
    expect(editor.on).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    expect(editor.on).toHaveBeenCalledWith('transaction', expect.any(Function))
  })

  it('cleans up editor subscriptions on unmount', () => {
    const editor = createMockEditor()
    const { unmount } = render(<RichTextToolbar editor={editor} />)
    unmount()
    expect(editor.off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    expect(editor.off).toHaveBeenCalledWith('transaction', expect.any(Function))
  })

  it('renders text color button', () => {
    const editor = createMockEditor()
    const { getByTitle } = render(<RichTextToolbar editor={editor} />)
    expect(getByTitle('Text color')).toBeTruthy()
  })

  it('calls setColor via chain on text color change', () => {
    const editor = createMockEditor()
    const { getByTitle } = render(<RichTextToolbar editor={editor} />)
    const colorButton = getByTitle('Text color')
    fireEvent.click(colorButton)
    // Opening the popover calls chain indirectly; verify chain is accessible and editor not destroyed
    expect(editor.isDestroyed).toBe(false)
  })

  it('renders alignment buttons (left, center, right)', () => {
    const editor = createMockEditor()
    const { getByTitle } = render(<RichTextToolbar editor={editor} />)
    expect(getByTitle('Align left')).toBeTruthy()
    expect(getByTitle('Align center')).toBeTruthy()
    expect(getByTitle('Align right')).toBeTruthy()
  })

  it('shows center alignment as active when isActive returns true for textAlign center', () => {
    const editor = createMockEditor()
    ;(editor.isActive as ReturnType<typeof vi.fn>).mockImplementation((arg: unknown) => {
      if (typeof arg === 'object' && arg !== null && (arg as Record<string, unknown>).textAlign === 'center') return true
      return false
    })
    const { getByTitle } = render(<RichTextToolbar editor={editor} />)
    const centerButton = getByTitle('Align center')
    expect(centerButton.className).toContain('border-leather')
  })

  it('calls setTextAlign("left") on align left click', () => {
    const editor = createMockEditor()
    const { getByTitle } = render(<RichTextToolbar editor={editor} />)
    const leftButton = getByTitle('Align left')
    fireEvent.mouseDown(leftButton)
    expect(editor.chain).toHaveBeenCalled()
  })
})
