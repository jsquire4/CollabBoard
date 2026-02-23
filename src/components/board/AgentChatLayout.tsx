'use client'

import { useRef, useEffect, useCallback, KeyboardEvent, ReactNode } from 'react'
import type { ChatMessage } from '@/hooks/useAgentChat'

export interface AgentChatLayoutProps {
  /** Panel container styles */
  className?: string
  style?: React.CSSProperties

  /** Header content */
  header: ReactNode

  /** Optional quick-action buttons rendered above the input row */
  quickActions?: ReactNode

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

  /** Pending quick action pills (shown in input area, user can remove before send) */
  pendingPills?: { id: string; label: string }[]
  onRemovePending?: (id: string) => void

  /** Actions */
  onSend: () => void
}

/**
 * Shared chrome for agent chat panels: auto-scroll, input row, close button,
 * messages list. Each panel provides its own header and message renderer.
 */
export function AgentChatLayout({
  className = '',
  style,
  header,
  quickActions,
  messages,
  renderMessage,
  emptyText = 'No messages yet.',
  error,
  input,
  onInputChange,
  inputPlaceholder = 'Type a message… (Enter to send)',
  pendingPills,
  onRemovePending,
  onSend,
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
          <p className="text-xs text-charcoal/40 text-center">{emptyText}</p>
        )}
        {messages.map(msg => renderMessage(msg))}
        {error && (
          <p className="text-xs text-red-400 text-center mt-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions — above input */}
      {quickActions && (
        <div className="border-t border-parchment-border shrink-0">
          {quickActions}
        </div>
      )}

      {/* Input row */}
      <div className={`${quickActions ? '' : 'border-t border-parchment-border '}p-3 flex flex-col gap-2 shrink-0`}>
        {pendingPills && pendingPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pendingPills.map(pill => (
              <span
                key={pill.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-navy/20 bg-navy/5 text-charcoal"
              >
                {pill.label}
                {onRemovePending && (
                  <button
                    type="button"
                    onClick={() => onRemovePending(pill.id)}
                    className="p-0.5 rounded-full hover:bg-navy/10 transition-colors"
                    aria-label={`Remove ${pill.label}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-none rounded border border-parchment-border bg-white px-3 py-2 text-sm text-charcoal placeholder-charcoal/30 focus:outline-none focus:ring-2 focus:ring-navy/40 focus:border-navy/30 disabled:opacity-50 transition-shadow"
            rows={2}
            placeholder={inputPlaceholder}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() && (!pendingPills || pendingPills.length === 0)}
          aria-label="Send message"
          className="px-3 py-2 rounded bg-gradient-to-r from-navy to-navy/90 text-parchment text-sm font-medium border border-navy/80 hover:from-brg hover:to-brg/90 hover:border-brg/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
