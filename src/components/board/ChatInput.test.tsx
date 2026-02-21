/**
 * Tests for ChatInput (chat message input).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('renders textarea and Send button', () => {
    const onSend = vi.fn()
    const onCancel = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} onCancel={onCancel} />)
    expect(screen.getByPlaceholderText(/ask the ai/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('shows Stop button when isLoading', () => {
    const onCancel = vi.fn()
    render(<ChatInput onSend={vi.fn()} isLoading={true} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
  })

  it('calls onSend when Send clicked with text', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} onCancel={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/ask the ai/i)
    const sendBtn = screen.getByRole('button', { name: /send/i })
    await userEvent.type(textarea, 'Hello')
    expect(sendBtn).not.toBeDisabled()
    await userEvent.click(sendBtn)
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('clears text after send', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} onCancel={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/ask the ai/i)
    await userEvent.type(textarea, 'Hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(textarea).toHaveValue('')
  })

  it('Send disabled when text empty', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('does not send when only whitespace', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ask the ai/i), '   ')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on Enter without Shift', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} onCancel={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/ask the ai/i)
    await userEvent.type(textarea, 'Hi{Enter}')
    expect(onSend).toHaveBeenCalledWith('Hi')
  })

  it('calls onCancel when Stop clicked', async () => {
    const onCancel = vi.fn()
    render(<ChatInput onSend={vi.fn()} isLoading={true} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
