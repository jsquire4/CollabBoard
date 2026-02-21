/**
 * Tests for ChatPanel (global chat UI).
 * Pattern: mock useAgentChat + child components, render with RTL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Hook + child component mocks ─────────────────────────────────────────────

vi.mock('@/hooks/useAgentChat', () => ({
  useAgentChat: vi.fn(),
}))

vi.mock('./ChatMessage', () => ({
  ChatMessage: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid={`chat-msg-${message.id}`}>{message.content}</div>
  ),
}))

vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSend, isLoading, onCancel }: { onSend: (msg: string) => void; isLoading: boolean; onCancel?: () => void }) => (
    <div data-testid="chat-input">
      <button type="button" onClick={() => onSend('test msg')} disabled={isLoading}>Send</button>
      {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      <span data-testid="loading-state">{isLoading ? 'loading' : 'idle'}</span>
    </div>
  ),
}))

vi.mock('./BoardFilesList', () => ({
  BoardFilesList: ({ objects }: { objects?: unknown }) => (
    objects ? <div data-testid="board-files-list">files</div> : null
  ),
}))

import { useAgentChat } from '@/hooks/useAgentChat'
import type { ChatMessage as ChatMessageType } from '@/hooks/useAgentChat'
import { ChatPanel } from './ChatPanel'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    user_display_name: null,
    isStreaming: false,
    ...overrides,
  }
}

function defaultHookReturn(overrides: Partial<ReturnType<typeof useAgentChat>> = {}) {
  return {
    messages: [] as ChatMessageType[],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  }
}

const BOARD_ID = 'board-123'
const noop = () => {}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn())
    // Mock window dimensions for positioning
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
  })

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <ChatPanel boardId={BOARD_ID} isOpen={false} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders "AI Assistant" header text when open', () => {
    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
  })

  it('close button with aria-label calls onClose', async () => {
    const onClose = vi.fn()
    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: /close chat/i })
    await userEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses useAgentChat with mode: { type: "global" }', () => {
    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(useAgentChat).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: BOARD_ID,
        mode: { type: 'global' },
      }),
    )
  })

  it('renders messages from hook', () => {
    const msgs = [
      makeMessage({ id: 'u1', role: 'user', content: 'Hello' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'Hi there' }),
    ]
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: msgs }))

    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(screen.getByTestId('chat-msg-u1')).toBeInTheDocument()
    expect(screen.getByTestId('chat-msg-a1')).toBeInTheDocument()
  })

  it('error state renders with text-red-600 styling', () => {
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ error: 'Something broke' }))

    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const errorEl = screen.getByText('Something broke')
    expect(errorEl).toBeInTheDocument()
    expect(errorEl.className).toContain('text-red-600')
  })

  it('sendMessage is passed to ChatInput', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const sendButton = screen.getByText('Send')
    await userEvent.click(sendButton)

    expect(sendMessage).toHaveBeenCalledWith('test msg')
  })

  it('passes cancel as onCancel to ChatInput', () => {
    const cancel = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ cancel }))

    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const cancelButton = screen.getByText('Cancel')
    expect(cancelButton).toBeInTheDocument()
  })

  it('isLoading is passed through to ChatInput', () => {
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ isLoading: true }))

    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(screen.getByTestId('loading-state').textContent).toBe('loading')
  })

  it('BoardFilesList rendered when objects prop provided; hidden when omitted', () => {
    const objects = new Map()
    const { rerender } = render(
      <ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} objects={objects} />
    )

    expect(screen.getByTestId('board-files-list')).toBeInTheDocument()

    rerender(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)
    expect(screen.queryByTestId('board-files-list')).not.toBeInTheDocument()
  })

  it('drag header updates panel position', async () => {
    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const header = screen.getByText('AI Assistant').closest('.cursor-move')
    expect(header).toBeInTheDocument()
    if (!header) throw new Error('header not found')

    const panel = header.parentElement as HTMLElement
    const initialLeft = panel.style.left

    await act(async () => {
      fireEvent.mouseDown(header, { clientX: 100, clientY: 200 })
      fireEvent.mouseMove(window, { clientX: 150, clientY: 250 })
      fireEvent.mouseUp(window)
    })

    await waitFor(() => {
      expect(panel.style.left).not.toBe(initialLeft)
    })
  })

  it('resize handle updates panel size', async () => {
    render(<ChatPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const resizeHandle = document.querySelector('.cursor-nesw-resize')
    expect(resizeHandle).toBeInTheDocument()
    if (!resizeHandle) throw new Error('resizeHandle not found')

    const panel = resizeHandle.closest('.flex') as HTMLElement
    const initialWidth = panel.style.width

    await act(async () => {
      fireEvent.mouseDown(resizeHandle, { clientX: 200, clientY: 600 })
      fireEvent.mouseMove(window, { clientX: 250, clientY: 650 })
      // Don't fire mouseUp - it clears resizeRef before setPos callback runs
    })

    await waitFor(() => {
      expect(panel.style.width).not.toBe(initialWidth)
    })
  })
})
