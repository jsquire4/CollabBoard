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

vi.mock('@/contexts/BoardContext', () => ({
  useBoardContext: vi.fn(),
}))

import { useAgentChat } from '@/hooks/useAgentChat'
import { useBoardContext } from '@/contexts/BoardContext'
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
    vi.mocked(useBoardContext).mockReturnValue({
      selectedIds: new Set<string>(),
      objects: new Map(),
    } as ReturnType<typeof useBoardContext>)
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
    // User messages use bg-navy class
    expect(bubble.className).toContain('bg-navy')
  })

  // 6. renders an assistant message left-aligned
  it('renders an assistant message left-aligned', () => {
    const assistantMsg = makeMessage({ id: 'a1', role: 'assistant', content: 'Hi, I am the assistant' })
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ messages: [assistantMsg] }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const bubble = screen.getByText('Hi, I am the assistant')
    expect(bubble).toBeInTheDocument()
    // Assistant messages use bg-parchment-dark class
    expect(bubble.className).toContain('bg-parchment-dark')
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

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await userEvent.click(sendButton)

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith('Hello agent', 'Hello agent', undefined)
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
    expect(sendMessage).toHaveBeenCalledWith('Enter message', 'Enter message', undefined)
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

  // 11. shows error when error is set; input and Send stay enabled for queueing
  it('shows error message when error is set, input and Send stay enabled for queueing', () => {
    vi.mocked(useAgentChat).mockReturnValue(
      defaultHookReturn({
        isLoading: true,
        error: 'Something went wrong',
      })
    )

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const textarea = screen.getByPlaceholderText(/ask the board assistant/i)
    expect(textarea).not.toBeDisabled()

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong').className).toContain('text-red-400')
  })

  // ── Quick Action Chips ────────────────────────────────────────────

  // 12. renders Quick Actions trigger and shows actions when menu opened
  it('renders Quick Actions trigger and shows actions when menu opened', async () => {
    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    expect(screen.getByTestId('quick-actions-trigger')).toBeInTheDocument()
    expect(screen.getByText('Quick Actions')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))

    expect(screen.getByText('SWOT Analysis')).toBeInTheDocument()
    expect(screen.getByText('User Journey')).toBeInTheDocument()
    expect(screen.getByText('Retrospective')).toBeInTheDocument()
    expect(screen.getByText('2x3 Sticky Grid')).toBeInTheDocument()
    expect(screen.getByText('Summarize Board')).toBeInTheDocument()
    // Arrange in Grid requires selection — not shown when selectedIds is empty
    expect(screen.queryByText('Arrange in Grid')).not.toBeInTheDocument()
  })

  // 13. clicking quick action adds pill; Send fires sendMessage with combined content
  it('adds quick action as pill when chip clicked, sends when Send clicked', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    await userEvent.click(screen.getByText('SWOT Analysis'))
    await userEvent.click(screen.getByTestId('quick-actions-close'))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(screen.getByText('SWOT Analysis')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage.mock.calls[0][0]).toContain('SWOT Analysis')
    expect(sendMessage.mock.calls[0][1]).toBe('SWOT Analysis')
    expect(sendMessage.mock.calls[0][2]).toEqual(['swot'])
  })

  // 14a. selection-dependent quick actions appear when menu opened with objects selected
  it('shows Arrange in Grid when objects are selected', async () => {
    vi.mocked(useBoardContext).mockReturnValue({
      selectedIds: new Set(['obj-1', 'obj-2']),
      objects: new Map([['obj-1', { type: 'sticky_note' }], ['obj-2', { type: 'sticky_note' }]]),
    } as ReturnType<typeof useBoardContext>)

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    expect(screen.getByText('Arrange in Grid')).toBeInTheDocument()
    expect(screen.getByText('Arrange Horizontally')).toBeInTheDocument()
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  // 14b. table actions only appear when a table is selected
  it('shows Read Table when a table is selected', async () => {
    vi.mocked(useBoardContext).mockReturnValue({
      selectedIds: new Set(['table-1']),
      objects: new Map([['table-1', { type: 'table' }]]),
    } as ReturnType<typeof useBoardContext>)

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    expect(screen.getByText('Read Table')).toBeInTheDocument()
    expect(screen.getByText('Add Table Row')).toBeInTheDocument()
    expect(screen.getByText('Update Table Cell')).toBeInTheDocument()
  })

  it('hides table actions when non-table is selected', async () => {
    vi.mocked(useBoardContext).mockReturnValue({
      selectedIds: new Set(['sticky-1']),
      objects: new Map([['sticky-1', { type: 'sticky_note' }]]),
    } as ReturnType<typeof useBoardContext>)

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    expect(screen.queryByText('Read Table')).not.toBeInTheDocument()
    expect(screen.queryByText('Add Table Row')).not.toBeInTheDocument()
  })

  // 14c. quick action trigger stays enabled when isLoading (queueing allowed)
  it('keeps quick action trigger enabled when isLoading for queueing', () => {
    vi.mocked(useAgentChat).mockReturnValue(
      defaultHookReturn({ isLoading: true })
    )

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    const trigger = screen.getByTestId('quick-actions-trigger')
    expect(trigger).not.toBeDisabled()
  })

  it('injects inference prompt when 2+ pills sent together', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    await userEvent.click(screen.getByText('Add Sticky Note'))
    await userEvent.click(screen.getByText('Add Frame'))
    await userEvent.click(screen.getByTestId('quick-actions-close'))
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage.mock.calls[0][0]).toContain('queued multiple requests')
    expect(sendMessage.mock.calls[0][0]).toMatch(/does this combination make sense/i)
    expect(sendMessage.mock.calls[0][2]).toEqual(['sticky', 'frame'])
  })

  it('deduplicates repeated actions: same prompt once with (×N) when action added multiple times', async () => {
    const sendMessage = vi.fn()
    vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    await userEvent.click(screen.getByTestId('quick-action-swot'))
    await userEvent.click(screen.getByTestId('quick-action-swot'))
    await userEvent.click(screen.getByTestId('quick-actions-close'))
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(sendMessage).toHaveBeenCalledOnce()
    const msg = sendMessage.mock.calls[0][0]
    expect(msg).toContain('(×2)')
    expect(sendMessage.mock.calls[0][2]).toEqual(['swot', 'swot'])
  })

  it('removes pill when X clicked', async () => {
    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    await userEvent.click(screen.getByText('Add Sticky Note'))
    await userEvent.click(screen.getByTestId('quick-actions-close'))

    expect(screen.getByText('Add Sticky Note')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove add sticky note/i }))
    expect(screen.queryByText('Add Sticky Note')).not.toBeInTheDocument()
  })

  it('closes quick actions menu when X is clicked', async () => {
    render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

    await userEvent.click(screen.getByTestId('quick-actions-trigger'))
    expect(screen.getByText('SWOT Analysis')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('quick-actions-close'))
    expect(screen.queryByText('SWOT Analysis')).not.toBeInTheDocument()
  })

  // ── Parameterized: all always-visible quick actions ─────────────────────────

  const ALWAYS_VISIBLE_ACTIONS: { id: string; label: string }[] = [
    { id: 'sticky', label: 'Add Sticky Note' },
    { id: 'rectangle', label: 'Add Rectangle' },
    { id: 'frame', label: 'Add Frame' },
    { id: 'table', label: 'Add Table' },
    { id: 'swot', label: 'SWOT Analysis' },
    { id: 'journey', label: 'User Journey' },
    { id: 'retro', label: 'Retrospective' },
    { id: 'sticky-grid', label: '2x3 Sticky Grid' },
    { id: 'delete-empty', label: 'Delete Empty Notes' },
    { id: 'summarize', label: 'Summarize Board' },
    { id: 'describe-image', label: 'Describe Image' },
  ]

  it.each(ALWAYS_VISIBLE_ACTIONS)(
    'quick action "$label" (id: $id) adds pill, Send calls sendMessage with quickActionIds',
    async ({ id, label }) => {
      const sendMessage = vi.fn()
      vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))

      render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

      await userEvent.click(screen.getByTestId('quick-actions-trigger'))
      await userEvent.click(screen.getByText(label))

      expect(sendMessage).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))
      expect(sendMessage).toHaveBeenCalledOnce()
      expect(sendMessage.mock.calls[0][1]).toBe(label)
      expect(sendMessage.mock.calls[0][2]).toContain(id)
    },
  )

  // ── Selection-dependent quick actions ───────────────────────────────────────

  it.each([
    { id: 'grid', label: 'Arrange in Grid' },
    { id: 'horizontal', label: 'Arrange Horizontally' },
    { id: 'vertical', label: 'Arrange Vertically' },
    { id: 'circle', label: 'Arrange in Circle' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'group', label: 'Group' },
    { id: 'bring-front', label: 'Bring to Front' },
    { id: 'send-back', label: 'Send to Back' },
    { id: 'color-all', label: 'Recolor Selected' },
  ])(
    'selection action "$label" (id: $id) adds pill, Send calls sendMessage when selected',
    async ({ id, label }) => {
      const sendMessage = vi.fn()
      vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))
      vi.mocked(useBoardContext).mockReturnValue({
        selectedIds: new Set(['obj-1', 'obj-2']),
        objects: new Map([
          ['obj-1', { type: 'sticky_note' }],
          ['obj-2', { type: 'sticky_note' }],
        ]),
      } as ReturnType<typeof useBoardContext>)

      render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

      await userEvent.click(screen.getByTestId('quick-actions-trigger'))
      await userEvent.click(screen.getByText(label))
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))

      expect(sendMessage).toHaveBeenCalledOnce()
      expect(sendMessage.mock.calls[0][2]).toContain(id)
    },
  )

  it.each([
    { id: 'ungroup', label: 'Ungroup' },
  ])(
    'group action "$label" (id: $id) adds pill, Send calls sendMessage when group selected',
    async ({ id, label }) => {
      const sendMessage = vi.fn()
      vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))
      vi.mocked(useBoardContext).mockReturnValue({
        selectedIds: new Set(['grp-1']),
        objects: new Map([['grp-1', { type: 'group' }]]),
      } as ReturnType<typeof useBoardContext>)

      render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

      await userEvent.click(screen.getByTestId('quick-actions-trigger'))
      await userEvent.click(screen.getByText(label))
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))

      expect(sendMessage).toHaveBeenCalledOnce()
      expect(sendMessage.mock.calls[0][2]).toContain(id)
    },
  )

  it.each([
    { id: 'read-table', label: 'Read Table' },
    { id: 'add-table-row', label: 'Add Table Row' },
    { id: 'update-table-cell', label: 'Update Table Cell' },
  ])(
    'table action "$label" (id: $id) adds pill, Send calls sendMessage when table selected',
    async ({ id, label }) => {
      const sendMessage = vi.fn()
      vi.mocked(useAgentChat).mockReturnValue(defaultHookReturn({ sendMessage }))
      vi.mocked(useBoardContext).mockReturnValue({
        selectedIds: new Set(['tbl-1']),
        objects: new Map([['tbl-1', { type: 'table' }]]),
      } as ReturnType<typeof useBoardContext>)

      render(<GlobalAgentPanel boardId={BOARD_ID} isOpen={true} onClose={noop} />)

      await userEvent.click(screen.getByTestId('quick-actions-trigger'))
      await userEvent.click(screen.getByText(label))
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))

      expect(sendMessage).toHaveBeenCalledOnce()
      expect(sendMessage.mock.calls[0][2]).toContain(id)
    },
  )
})
