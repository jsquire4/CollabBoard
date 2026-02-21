'use client'

import { useState, useCallback } from 'react'
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
}

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
  getBoardState: 'Reading board...',
  readFileContent: 'Reading file...',
  getFrameObjects: 'Inspecting frame...',
  describeImage: 'Analyzing image...',
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
          <p className="text-xs text-indigo-500 mb-1 px-1">{getToolProgressLabel(latestTool.toolName)}</p>
        )}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
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

export function AgentChatPanel({
  agentObjectId,
  boardId,
  position,
  isOpen,
  onClose,
  agentState,
  agentName = 'Board Agent',
}: AgentChatPanelProps) {
  const [input, setInput] = useState('')

  const { messages, isLoading, error, sendMessage } = useAgentChat({
    boardId,
    mode: { type: 'agent', agentObjectId },
    enabled: isOpen && !!agentObjectId,
  })

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage(trimmed)
    setInput('')
  }, [input, isLoading, sendMessage])

  if (!isOpen) return null

  const isThinking = agentState === 'thinking' || isLoading

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
      <div className="flex items-center gap-2">
        <StateIndicator agentState={agentState} />
        <span className="text-sm font-semibold text-slate-700">{agentName}</span>
        {isThinking && (
          <span className="text-xs text-amber-500 font-medium">Thinking…</span>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  return (
    <AgentChatLayout
      className="fixed z-50 w-80 rounded-lg bg-white shadow-xl border border-slate-200"
      style={{ left: position.x, top: position.y, maxHeight: '70vh' }}
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
      onClose={onClose}
    />
  )
}
