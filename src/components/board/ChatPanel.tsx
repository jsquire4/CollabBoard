'use client'

import { useRef, useEffect } from 'react'
import { useAgentChat } from '@/hooks/useAgentChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { BoardFilesList } from './BoardFilesList'
import type { BoardObject } from '@/types/board'

interface ChatPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
  objects?: Map<string, BoardObject>
  onDeleteFile?: (objectId: string, storagePath: string) => void
}

export function ChatPanel({ boardId, isOpen, onClose, objects, onDeleteFile }: ChatPanelProps) {
  const { messages, isLoading, error, sendMessage, cancel } = useAgentChat({
    boardId,
    enabled: isOpen,
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div
      className={`fixed right-0 top-0 z-50 flex h-full w-96 flex-col bg-white shadow-xl transition-transform duration-200 dark:bg-slate-800 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-600">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white">AI Assistant</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          aria-label="Close chat"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* File list */}
      {objects && <BoardFilesList objects={objects} onDelete={onDeleteFile} />}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        isLoading={isLoading}
        onCancel={cancel}
      />
    </div>
  )
}
