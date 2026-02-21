'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useAgentChat, type ChatMessage } from '@/hooks/useAgentChat'
import { AgentChatLayout } from './AgentChatLayout'

export interface GlobalAgentPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
}

const PANEL_WIDTH = 320
const PANEL_HEIGHT_MAX_RATIO = 0.7 // 70vh

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
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const mode = useMemo(() => ({ type: 'global' as const }), [])
  const { messages, isLoading, error, sendMessage } = useAgentChat({
    boardId,
    mode,
    enabled: isOpen,
  })

  // Initialize position when first opened
  useEffect(() => {
    if (isOpen && pos === null) {
      setPos({
        x: window.innerWidth - PANEL_WIDTH - 16,
        y: Math.max(16, window.innerHeight * (1 - PANEL_HEIGHT_MAX_RATIO) - 16),
      })
    }
  }, [isOpen, pos])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
    setInput('')
  }, [input, isLoading, sendMessage])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - PANEL_WIDTH, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy)),
      })
    }
    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [pos])

  if (!isOpen || !pos) return null

  const header = (
    <div
      className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0 cursor-move select-none rounded-t-xl"
      onMouseDown={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        </div>
        <span className="text-sm font-semibold text-slate-700">Board Assistant</span>
        <span className="text-xs text-slate-400">· shared</span>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Close global agent"
        onMouseDown={e => e.stopPropagation()}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  return (
    <AgentChatLayout
      className="fixed z-50 w-80 rounded-xl bg-white shadow-xl border border-slate-200"
      style={{ left: pos.x, top: pos.y, maxHeight: '70vh' }}
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
