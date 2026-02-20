import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRichTextEditing } from './useRichTextEditing'
import { makeRectangle, makeStickyNote, makeRichTextObject, objectsMap } from '@/test/boardObjectFactory'
import Konva from 'konva'

// Shared mock editor instance so tests can verify calls
const mockEditor = {
  getJSON: vi.fn(() => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
  })),
  getText: vi.fn(() => 'test'),
  commands: {
    setContent: vi.fn(),
    focus: vi.fn(),
  },
  isDestroyed: false,
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
}

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => mockEditor),
  EditorContent: vi.fn(),
}))

vi.mock('@/lib/richtext/extensions', () => ({
  TIPTAP_EXTENSIONS: [],
}))

vi.mock('@/lib/richText', () => ({
  RICH_TEXT_ENABLED: true,
  extractPlainText: vi.fn((doc) => {
    if (!doc?.content) return ''
    return doc.content.map((n: { content?: { text?: string }[] }) => n.content?.map(c => c.text ?? '').join('') ?? '').join('\n')
  }),
  plainTextToTipTap: vi.fn((text: string) => ({
    type: 'doc',
    content: (text || '').split('\n').map((line: string) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  })),
}))

function createMockTextNode(): Konva.Text {
  return {
    getClientRect: () => ({ x: 100, y: 200, width: 150, height: 80 }),
    name: () => 'body',
  } as unknown as Konva.Text
}

function createDefaultDeps(overrides?: Partial<ReturnType<typeof getDefaultDeps>>) {
  return { ...getDefaultDeps(), ...overrides }
}

function getDefaultDeps() {
  const obj = makeRectangle({ id: 'r1', text: 'Hello' })
  return {
    objects: objectsMap(obj),
    stageScale: 1,
    canEdit: true,
    shapeRefs: { current: new Map<string, Konva.Node>() },
    onUpdateText: vi.fn(),
    onUpdateTitle: vi.fn(),
    onUpdateRichText: vi.fn(),
    onEditingChange: vi.fn(),
    onActivity: vi.fn(),
    pendingEditId: null as string | null | undefined,
    onPendingEditConsumed: vi.fn(),
    tryEnterGroup: vi.fn(() => false),
  }
}

describe('useRichTextEditing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with null editingId', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    expect(result.current.editingId).toBeNull()
  })

  it('handleStartEdit sets editingId for text field', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.editingId).toBe('r1')
    expect(result.current.editingField).toBe('text')
  })

  it('handleStartEdit guards when canEdit is false', () => {
    const deps = createDefaultDeps({ canEdit: false })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.editingId).toBeNull()
  })

  it('handleStartEdit defers to tryEnterGroup', () => {
    const deps = createDefaultDeps({ tryEnterGroup: vi.fn(() => true) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.editingId).toBeNull()
    expect(deps.tryEnterGroup).toHaveBeenCalledWith('r1')
  })

  it('handleStartEdit with title field sets plain text mode', () => {
    const stickyNote = makeStickyNote({ id: 'sn1', title: 'My Title' })
    const deps = createDefaultDeps({ objects: objectsMap(stickyNote) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    const titleNode = {
      getClientRect: () => ({ x: 50, y: 60, width: 130, height: 20 }),
      name: () => 'title',
    } as unknown as Konva.Text

    act(() => {
      result.current.handleStartEdit('sn1', titleNode, 'title')
    })
    expect(result.current.editingField).toBe('title')
    expect(result.current.editText).toBe('My Title')
  })

  it('handleFinishEdit calls onUpdateRichText for text field', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    act(() => {
      result.current.handleFinishEdit()
    })
    expect(deps.onUpdateRichText).toHaveBeenCalledWith('r1', expect.any(String), { text: 'Hello', rich_text: null })
    expect(result.current.editingId).toBeNull()
  })

  it('handleFinishEdit calls onUpdateTitle for title field', () => {
    const stickyNote = makeStickyNote({ id: 'sn1', title: 'My Title' })
    const deps = createDefaultDeps({ objects: objectsMap(stickyNote) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    const titleNode = {
      getClientRect: () => ({ x: 50, y: 60, width: 130, height: 20 }),
      name: () => 'title',
    } as unknown as Konva.Text

    act(() => {
      result.current.handleStartEdit('sn1', titleNode, 'title')
    })
    act(() => {
      result.current.handleFinishEdit()
    })
    expect(deps.onUpdateTitle).toHaveBeenCalledWith('sn1', 'My Title')
  })

  it('handleStartEdit loads existing rich_text into editor', () => {
    mockEditor.commands.setContent.mockClear()
    const richObj = makeRichTextObject({ id: 'rt1' })
    const deps = createDefaultDeps({ objects: objectsMap(richObj) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('rt1', createMockTextNode())
    })
    expect(mockEditor.commands.setContent).toHaveBeenCalled()
  })

  it('handleStartEdit converts plain text to TipTap doc for legacy shapes', () => {
    mockEditor.commands.setContent.mockClear()
    const obj = makeRectangle({ id: 'legacy', text: 'Plain text' })
    const deps = createDefaultDeps({ objects: objectsMap(obj) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('legacy', createMockTextNode())
    })
    expect(mockEditor.commands.setContent).toHaveBeenCalled()
  })

  it('notifies onEditingChange when editing starts/stops', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(deps.onEditingChange).toHaveBeenCalledWith(true)
    act(() => {
      result.current.handleFinishEdit()
    })
    expect(deps.onEditingChange).toHaveBeenCalledWith(false)
  })

  it('calls onActivity when editing starts', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(deps.onActivity).toHaveBeenCalled()
  })

  it('handleShapeDoubleClick records for triple-click detection', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleShapeDoubleClick('r1')
    })
    expect(result.current.lastDblClickRef.current).toEqual({
      id: 'r1',
      time: expect.any(Number),
    })
  })

  it('handleShapeDoubleClick defers to tryEnterGroup', () => {
    const deps = createDefaultDeps({ tryEnterGroup: vi.fn(() => true) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleShapeDoubleClick('r1')
    })
    expect(deps.tryEnterGroup).toHaveBeenCalledWith('r1')
    expect(result.current.lastDblClickRef.current).toBeNull()
  })

  it('returns editor', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    expect(result.current.editor).toBeDefined()
  })

  it('sets overlay style for text field editing', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.overlayStyle).toHaveProperty('pointerEvents', 'auto')
  })

  it('overlay style includes maxHeight and overflow for text overflow', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.overlayStyle).toHaveProperty('maxHeight')
    expect(result.current.overlayStyle).toHaveProperty('overflowY', 'auto')
  })

  it('captures before state at edit start for correct undo', () => {
    const obj = makeRectangle({ id: 'r1', text: 'Original' })
    const deps = createDefaultDeps({ objects: objectsMap(obj) })
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    act(() => {
      result.current.handleFinishEdit()
    })
    // The before state should be the text at edit START, not at commit time
    expect(deps.onUpdateRichText).toHaveBeenCalledWith(
      'r1',
      expect.any(String),
      { text: 'Original', rich_text: null },
    )
  })

  it('closes editor when shape is deleted by remote user', () => {
    const obj = makeRectangle({ id: 'r1', text: 'Hello' })
    const deps = createDefaultDeps({ objects: objectsMap(obj) })
    const { result, rerender } = renderHook(
      (props) => useRichTextEditing(props),
      { initialProps: deps },
    )
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.editingId).toBe('r1')

    // Simulate remote deletion — object disappears from map
    const emptyObjects = new Map<string, ReturnType<typeof makeRectangle>>()
    rerender({ ...deps, objects: emptyObjects as never })
    expect(result.current.editingId).toBeNull()
  })

  it('commits current edit before starting a new one (shape switch)', () => {
    const obj1 = makeRectangle({ id: 'r1', text: 'First' })
    const obj2 = makeRectangle({ id: 'r2', text: 'Second' })
    const deps = createDefaultDeps({ objects: objectsMap(obj1, obj2) })
    const { result } = renderHook(() => useRichTextEditing(deps))

    // Start editing shape 1
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    expect(result.current.editingId).toBe('r1')

    // Switch to shape 2 — should commit shape 1 first
    act(() => {
      result.current.handleStartEdit('r2', createMockTextNode())
    })
    expect(deps.onUpdateRichText).toHaveBeenCalledWith('r1', expect.any(String), { text: 'First', rich_text: null })
    expect(result.current.editingId).toBe('r2')
  })

  it('handleFinishEdit is a no-op when editor is destroyed', () => {
    const deps = createDefaultDeps()
    const { result } = renderHook(() => useRichTextEditing(deps))
    act(() => {
      result.current.handleStartEdit('r1', createMockTextNode())
    })
    // Simulate editor destroyed
    mockEditor.isDestroyed = true
    act(() => {
      result.current.handleFinishEdit()
    })
    expect(deps.onUpdateRichText).not.toHaveBeenCalled()
    expect(result.current.editingId).toBeNull()
    // Reset for other tests
    mockEditor.isDestroyed = false
  })
})
