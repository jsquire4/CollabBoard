'use client'

import { useRef, useEffect, useCallback, KeyboardEvent, ReactNode } from 'react'
import type { ChatMessage } from '@/hooks/useAgentChat'

export interface AgentChatLayoutProps {
  /** Panel container styles */
  className?: string
  style?: React.CSSProperties

  /** Header content */
  header: ReactNode

  /** Messages to display */
  messages: ChatMessage[]
  /** Render a single message */
  renderMessage: (msg: ChatMessage) => ReactNode
  /** Empty state text when no messages */
  emptyText?: string

  /** Error string from the hook */
  error?: string | null

  /** Input state */
  input: string
  onInputChange: (value: string) => void
  inputPlaceholder?: string

  /** Actions */
  onSend: () => void
  isLoading: boolean
}

/**
 * Shared chrome for agent chat panels: auto-scroll, input row, close button,
 * messages list. Each panel provides its own header and message renderer.
 */
export function AgentChatLayout({
  className = '',
  style,
  header,
  messages,
  renderMessage,
  emptyText = 'No messages yet.',
  error,
  input,
  onInputChange,
  inputPlaceholder = 'Type a message… (Enter to send)',
  onSend,
  isLoading,
}: AgentChatLayoutProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }, [onSend])

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      style={style}
    >
      {/* Header slot */}
      {header}

      {/* Messages area */}
      <div className="flex-1 p-4 overflow-y-auto min-h-32">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center">{emptyText}</p>
        )}
        {messages.map(msg => renderMessage(msg))}
        {error && (
          <p className="text-xs text-red-500 text-center mt-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="border-t border-slate-100 p-3 flex gap-2 shrink-0">
        <textarea
          className="flex-1 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          rows={2}
          placeholder={inputPlaceholder}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          onClick={onSend}
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
