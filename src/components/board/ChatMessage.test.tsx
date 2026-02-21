/**
 * Tests for ChatMessage (chat message display).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/hooks/useAgentChat'

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

describe('ChatMessage', () => {
  it('renders user message with content', () => {
    render(<ChatMessage message={makeMessage({ role: 'user', content: 'Hi there' })} />)
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('renders assistant message with content', () => {
    render(<ChatMessage message={makeMessage({ role: 'assistant', content: 'How can I help?' })} />)
    expect(screen.getByText('How can I help?')).toBeInTheDocument()
  })

  it('shows streaming dots when isStreaming and no content', () => {
    render(<ChatMessage message={makeMessage({ role: 'assistant', content: '', isStreaming: true })} />)
    const dots = document.querySelectorAll('.animate-bounce')
    expect(dots.length).toBeGreaterThanOrEqual(3)
  })

  it('does not show streaming dots when content present', () => {
    render(<ChatMessage message={makeMessage({ role: 'assistant', content: 'Hello', isStreaming: true })} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    const dots = document.querySelectorAll('.animate-bounce')
    expect(dots.length).toBe(0)
  })

  it('renders tool calls when present', () => {
    render(
      <ChatMessage
        message={makeMessage({
          role: 'assistant',
          content: 'Done',
          toolCalls: [{ toolName: 'create_rectangle', args: {} }],
        })}
      />
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('create_rectangle')).toBeInTheDocument()
  })

  it('renders multiple tool calls', () => {
    render(
      <ChatMessage
        message={makeMessage({
          role: 'assistant',
          content: 'OK',
          toolCalls: [
            { toolName: 'tool_a', args: {} },
            { toolName: 'tool_b', args: {} },
          ],
        })}
      />
    )
    expect(screen.getByText('tool_a')).toBeInTheDocument()
    expect(screen.getByText('tool_b')).toBeInTheDocument()
  })
})
