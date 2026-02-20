'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useGlobalAgentChat, type ChatMessage } from '@/hooks/useGlobalAgentChat'

export interface GlobalAgentPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  const isRight = msg.role === 'user'
  const attribution = msg.user_display_name

  return (
    <div className={`flex ${isRight ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isRight ? 'items-end' : 'items-start'} flex flex-col`}>
        {attribution && (
          <span className={`text-xs text-slate-400 mb-1 ${isRight ? 'text-right' : 'text-left'}`}>
            {attribution}
          </span>
        )}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isRight
              ? 'bg-indigo-500 text-white rounded-br-sm'
              : 'bg-slate-100 text-slate-800 rounded-bl-sm'
          }`}
        >
          {msg.content || (msg.isStreaming ? <span className="opacity-50">…</span> : '')}
        </div>
      </div>
    </div>
  )
}

export function GlobalAgentPanel({ boardId, isOpen, onClose }: GlobalAgentPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, isLoading, error, sendMessage } = useGlobalAgentChat({
    boardId,
    enabled: isOpen,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
    setInput('')
  }, [input, isLoading, sendMessage])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  if (!isOpen) return null

  return (
    <div className="fixed right-4 bottom-16 z-50 w-80 rounded-xl bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">Board Assistant</span>
          <span className="text-xs text-slate-400">· shared</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close global agent"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto min-h-32">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center">Start a conversation with the board assistant.</p>
        )}
        {messages.map(msg => (
          <MessageRow key={msg.id} msg={msg} />
        ))}
        {error && (
          <p className="text-xs text-red-500 text-center mt-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3 flex gap-2 shrink-0">
        <textarea
          className="flex-1 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          rows={2}
          placeholder="Ask the board assistant… (Enter to send)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
