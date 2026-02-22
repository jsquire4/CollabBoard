'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useAgentChat, type ChatMessage } from '@/hooks/useAgentChat'
import { AgentChatLayout } from './AgentChatLayout'

export interface AgentChatPanelProps {
  agentObjectId: string
  boardId: string
  position: { x: number; y: number }
  isOpen: boolean
  onClose: () => void
  agentState?: 'idle' | 'thinking' | 'done' | 'error' | null
  agentName?: string
  viewportCenter?: { x: number; y: number }
}

const PANEL_WIDTH = 320

const TOOL_LABELS: Record<string, string> = {
  createStickyNote: 'Creating sticky note...',
  createShape: 'Creating shape...',
  createFrame: 'Creating frame...',
  createTable: 'Creating table...',
  createConnector: 'Creating connector...',
  moveObject: 'Moving object...',
  resizeObject: 'Resizing object...',
  deleteObject: 'Deleting object...',
  updateText: 'Updating text...',
  changeColor: 'Changing color...',
  getConnectedObjects: 'Reading connected objects...',
  readFileContent: 'Reading file...',
  getFrameObjects: 'Inspecting frame...',
  describeImage: 'Analyzing image...',
  saveMemory: 'Saving memory...',
  createDataConnector: 'Creating data connector...',
}

function getToolProgressLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Using ${toolName}...`
}

function StateIndicator({ agentState }: { agentState?: string | null }) {
  const colorMap: Record<string, string> = {
    idle: 'bg-slate-400',
    thinking: 'bg-amber-400 animate-pulse',
    done: 'bg-emerald-400',
    error: 'bg-red-400',
  }
  const color = colorMap[agentState ?? 'idle'] ?? 'bg-slate-400'
  return <div className={`w-2 h-2 rounded-full ${color}`} />
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const toolCalls = msg.toolCalls ?? []
  const latestTool = toolCalls[toolCalls.length - 1]

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : ''}`}>
        {/* Tool progress label */}
        {!isUser && msg.isStreaming && latestTool && (
          <p className="text-xs text-charcoal/50 mb-1 px-1">{getToolProgressLabel(latestTool.toolName)}</p>
        )}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
              ? 'bg-navy text-parchment rounded-br-sm'
              : 'bg-parchment-dark/60 border border-parchment-border text-charcoal rounded-bl-sm'
          }`}
        >
          {msg.content || (msg.isStreaming ? <span className="opacity-50">…</span> : '')}
        </div>
      </div>
    </div>
  )
}

export function AgentChatPanel({
  agentObjectId,
  boardId,
  position,
  isOpen,
  onClose,
  agentState,
  agentName = 'Board Agent',
  viewportCenter,
}: AgentChatPanelProps) {
  const [input, setInput] = useState('')
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origDx: number; origDy: number } | null>(null)

  const mode = useMemo(() => ({ type: 'agent' as const, agentObjectId }), [agentObjectId])
  const { messages, isLoading, error, sendMessage } = useAgentChat({
    boardId,
    mode,
    enabled: isOpen && !!agentObjectId,
    viewportCenter,
  })

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
    setInput('')
  }, [input, isLoading, sendMessage])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origDx: dragOffset.dx, origDy: dragOffset.dy }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = position.x + dragRef.current.origDx + dx
      const newY = position.y + dragRef.current.origDy + dy
      setDragOffset({
        dx: Math.max(-position.x, Math.min(window.innerWidth - PANEL_WIDTH - position.x, dragRef.current.origDx + dx)),
        dy: Math.max(-position.y, Math.min(window.innerHeight - 40 - position.y, dragRef.current.origDy + dy)),
      })
    }
    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [dragOffset, position])

  if (!isOpen) return null

  const isThinking = agentState === 'thinking' || isLoading

  const header = (
    <div
      className="flex items-center justify-between px-4 py-3 border-b border-parchment-border bg-parchment-dark/40 shrink-0 select-none rounded-t-lg"
      style={{ cursor: 'grab' }}
      onMouseDown={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <StateIndicator agentState={agentState} />
        <span className="text-sm font-semibold text-charcoal">{agentName}</span>
        {isThinking && (
          <span className="text-xs text-amber-500 font-medium">Thinking…</span>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-charcoal/40 hover:text-charcoal transition-colors"
        aria-label="Close"
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
      className="fixed z-50 w-80 rounded-lg bg-parchment border border-parchment-border overflow-hidden"
      style={{ left: position.x + dragOffset.dx, top: position.y + dragOffset.dy, maxHeight: '70vh', boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)' }}
      header={header}
      messages={messages}
      renderMessage={msg => <MessageBubble key={msg.id} msg={msg} />}
      emptyText="No messages yet."
      error={error}
      input={input}
      onInputChange={setInput}
      inputPlaceholder="Ask this agent… (Enter to send)"
      onSend={handleSend}
      isLoading={isLoading}
    />
  )
}
