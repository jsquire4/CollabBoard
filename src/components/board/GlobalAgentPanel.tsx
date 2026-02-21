'use client'

import { useState, useCallback, useMemo } from 'react'
import { useAgentChat, type ChatMessage } from '@/hooks/useAgentChat'
import { AgentChatLayout } from './AgentChatLayout'

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

  const mode = useMemo(() => ({ type: 'global' as const }), [])
  const { messages, isLoading, error, sendMessage } = useAgentChat({
    boardId,
    mode,
    enabled: isOpen,
  })

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
    setInput('')
  }, [input, isLoading, sendMessage])

  if (!isOpen) return null

  const header = (
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
  )

  return (
    <AgentChatLayout
      className="fixed right-4 bottom-16 z-50 w-80 rounded-xl bg-white shadow-xl border border-slate-200"
      style={{ maxHeight: '70vh' }}
      header={header}
      messages={messages}
      renderMessage={msg => <MessageRow key={msg.id} msg={msg} />}
      emptyText="Start a conversation with the board assistant."
      error={error}
      input={input}
      onInputChange={setInput}
      inputPlaceholder="Ask the board assistant… (Enter to send)"
      onSend={handleSend}
      isLoading={isLoading}
    />
  )
}
