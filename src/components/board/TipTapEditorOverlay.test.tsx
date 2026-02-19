import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TipTapEditorOverlay } from './TipTapEditorOverlay'

// Mock TipTap EditorContent
vi.mock('@tiptap/react', () => ({
  EditorContent: vi.fn(({ editor, style }) => (
    <div data-testid="editor-content" style={style}>
      {editor ? 'Editor mounted' : 'No editor'}
    </div>
  )),
}))

function createMockEditor() {
  return {
    getJSON: vi.fn(),
    commands: { setContent: vi.fn(), focus: vi.fn() },
    isDestroyed: false,
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
  } as unknown as import('@tiptap/react').Editor
}

describe('TipTapEditorOverlay', () => {
  const defaultStyle: React.CSSProperties = {
    position: 'absolute',
    left: 100,
    top: 200,
    width: 150,
  }

  it('renders nothing when editingId is null', () => {
    const { container } = render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId={null}
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when editingField is title', () => {
    const { container } = render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="title"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when editor is null', () => {
    const { container } = render(
      <TipTapEditorOverlay
        editor={null}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders editor content when editing text', () => {
    const { getByTestId } = render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    expect(getByTestId('editor-content')).toBeDefined()
  })

  it('applies overlay style to wrapper', () => {
    const { container } = render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.position).toBe('absolute')
  })

  it('triggers onFinish on Escape', () => {
    const onFinish = vi.fn()
    render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={onFinish}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('stops propagation on mousedown inside wrapper', () => {
    const { container } = render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={vi.fn()}
      />
    )
    const wrapper = container.firstChild as HTMLElement
    const event = new MouseEvent('mousedown', { bubbles: true })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    wrapper.dispatchEvent(event)
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('does not trigger onFinish on Escape during IME composition', () => {
    const onFinish = vi.fn()
    render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={onFinish}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('triggers onFinish when clicking outside wrapper after delay', async () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(
      <TipTapEditorOverlay
        editor={createMockEditor()}
        editingId="some-id"
        editingField="text"
        overlayStyle={defaultStyle}
        onFinish={onFinish}
      />
    )
    // Click outside before 100ms delay — should NOT trigger
    fireEvent.mouseDown(document.body)
    expect(onFinish).not.toHaveBeenCalled()

    // Advance past the 100ms delay
    vi.advanceTimersByTime(150)
    fireEvent.mouseDown(document.body)
    expect(onFinish).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
