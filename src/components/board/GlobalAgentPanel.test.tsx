/**
 * Tests for GlobalAgentPanel component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Browser API mocks ────────────────────────────────────────────────

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// ── Hook mock ────────────────────────────────────────────────────────

vi.mock('@/hooks/useAgentChat', () => ({
  useAgentChat: vi.fn(),
}))

import { useAgentChat } from '@/hooks/useAgentChat'
import type { ChatMessage } from '@/hooks/useAgentChat'

// ── Component under test ─────────────────────────────────────────────

import { GlobalAgentPanel } from './GlobalAgentPanel'

// ── Helpers ──────────────────────────────────────────────────────────

const BOARD_ID = 'board-123'
const noop = () => {}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
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
    messages: [] as ChatMessage[],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GlobalAgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn())
  })

  // 1. returns null when isOpen is false
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <GlobalAgentPanel boardId={BOARD_ID} isOpen={false} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  // 2. renders "Board Assistant" header when open
  it('renders "Board Assistant" header when open', () => {
    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)
    expect(screen.getByText('Board Assistant')).toBeInTheDocument()
  })

  // 3. shows close button and calls onClose when clicked
  it('shows close button and calls onClose when clicked', async () => {
    const onClose = vi.fn()
    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: /close global agent/i })
    await userEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledOnce()
  })

  // 4. shows empty state text when no messages
  it('shows empty state text when no messages', () => {
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: [] }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
  })

  // 5. renders a user message right-aligned
  it('renders a user message right-aligned', () => {
    const userMsg = makeMessage({ id: 'u1', role: 'user', content: 'Hello there' })
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: [userMsg] }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const bubble = screen.getByText('Hello there')
    expect(bubble).toBeInTheDocument()
    // User messages use bg-indigo-500 class
    expect(bubble.className).toContain('bg-indigo-500')
  })

  // 6. renders an assistant message left-aligned
  it('renders an assistant message left-aligned', () => {
    const assistantMsg = makeMessage({ id: 'a1', role: 'assistant', content: 'Hi, I am the assistant' })
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: [assistantMsg] }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const bubble = screen.getByText('Hi, I am the assistant')
    expect(bubble).toBeInTheDocument()
    // Assistant messages use bg-slate-100 class
    expect(bubble.className).toContain('bg-slate-100')
  })

  // 7. shows user_display_name attribution when present
  it('shows user_display_name attribution when present', () => {
    const userMsg = makeMessage({
      id: 'u1',
      role: 'user',
      content: 'My message',
      user_display_name: 'Alice',
    })
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: [userMsg] }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  // 8. calls sendMessage and clears input when Send clicked
  it('calls sendMessage with trimmed text and clears input when Send clicked', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const textarea = screen.getByPlaceholderText(/ask the board assistant/i)
    await userEvent.type(textarea, '  Hello agent  ')

    const sendButton = screen.getByRole('button', { name: /send/i })
    await userEvent.click(sendButton)

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith('Hello agent')
    expect(textarea).toHaveValue('')
  })

  // 9. calls sendMessage when Enter pressed (no Shift)
  it('calls sendMessage when Enter pressed without Shift', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const textarea = screen.getByPlaceholderText(/ask the board assistant/i)
    await userEvent.type(textarea, 'Enter message')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith('Enter message')
  })

  // 10. does NOT call sendMessage when Shift+Enter pressed
  it('does NOT call sendMessage when Shift+Enter is pressed', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const textarea = screen.getByPlaceholderText(/ask the board assistant/i)
    await userEvent.type(textarea, 'Multiline message')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(sendMessage).not.toHaveBeenCalled()
  })

  // 11. disables input and button when isLoading, and shows error when error is set
  it('disables input and Send button when isLoading is true, and shows error message when error is set', () => {
    vi.mocked(useAgentChat).mockReturnValue(
      defaultHookReturn({
        isLoading: true,
        error: 'Something went wrong',
      })
    )

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const textarea = screen.getByPlaceholderText(/ask the board assistant/i)
    const sendButton = screen.getByRole('button', { name: /send/i })

    expect(textarea).toBeDisabled()
    expect(sendButton).toBeDisabled()

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    // Error message should have red styling
    expect(screen.getByText('Something went wrong').className).toContain('text-red-500')
  })
})
