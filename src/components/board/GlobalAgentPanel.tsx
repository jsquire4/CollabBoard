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

// ── Quick Actions ──────────────────────────────────────────────────────────────

interface QuickAction {
  id: string
  label: string
  prompt: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'swot',
    label: 'SWOT Analysis',
    prompt: `Create a SWOT Analysis template on the board. Steps:
1. Create a frame titled "SWOT Analysis" at (100, 100) with width 820 and height 620.
2. Inside the frame, create 4 rectangles as quadrants:
   - "Strengths" at (110, 140) size 390x270, color #81C784 (green)
   - "Weaknesses" at (520, 140) size 390x270, color #E57373 (red)
   - "Opportunities" at (110, 430) size 390x270, color #4FC3F7 (blue)
   - "Threats" at (520, 430) size 390x270, color #FFB74D (orange)
3. Create 4 sticky notes with placeholder text inside each quadrant:
   - "Add strengths here..." in Strengths area
   - "Add weaknesses here..." in Weaknesses area
   - "Add opportunities here..." in Opportunities area
   - "Add threats here..." in Threats area
Execute ALL steps before responding.`,
  },
  {
    id: 'journey',
    label: 'User Journey',
    prompt: `Create a User Journey Map template on the board. Steps:
1. Create a frame titled "User Journey Map" at (100, 100) with width 1200 and height 400.
2. Inside the frame, create 5 rectangle columns for stages:
   - "Awareness" at (110, 140) size 220x240, color #CE93D8
   - "Consideration" at (340, 140) size 220x240, color #4FC3F7
   - "Decision" at (570, 140) size 220x240, color #81C784
   - "Onboarding" at (800, 140) size 220x240, color #FFB74D
   - "Retention" at (1030, 140) size 220x240, color #FFEB3B
3. Create 5 sticky notes with placeholder text, one per stage column:
   - "User discovers product" in Awareness
   - "User evaluates options" in Consideration
   - "User makes a choice" in Decision
   - "User gets started" in Onboarding
   - "User stays engaged" in Retention
Execute ALL steps before responding.`,
  },
  {
    id: 'retro',
    label: 'Retrospective',
    prompt: `Create a Retrospective template on the board with 3 columns. Steps:
1. Create 3 frames side by side:
   - "What went well" at (100, 100) size 350x500, color #81C784
   - "What could improve" at (470, 100) size 350x500, color #E57373
   - "Action items" at (840, 100) size 350x500, color #4FC3F7
2. Create 2 placeholder sticky notes in each frame (6 total):
   - "Great teamwork on X" and "Shipped feature Y on time" in "What went well"
   - "Slow code reviews" and "Unclear requirements" in "What could improve"
   - "Set up review SLA" and "Write acceptance criteria template" in "Action items"
Execute ALL steps before responding.`,
  },
  {
    id: 'grid',
    label: 'Arrange in Grid',
    prompt: `Arrange all objects on the board in a tidy grid layout. Steps:
1. Call getBoardState to see all current objects.
2. Call layoutObjects with layout "grid" to arrange them neatly.
Report what was arranged.`,
  },
  {
    id: 'sticky-grid',
    label: '2x3 Sticky Grid',
    prompt: `Create a 2x3 grid of sticky notes for pros/cons analysis. Steps:
1. Create a frame titled "Pros & Cons" at (100, 100) with width 500 and height 500.
2. Create 6 sticky notes in a 2-column, 3-row layout inside the frame:
   - Row 1: "Pro 1" (color #81C784) at (120, 160), "Con 1" (color #E57373) at (320, 160)
   - Row 2: "Pro 2" (color #81C784) at (120, 300), "Con 2" (color #E57373) at (320, 300)
   - Row 3: "Pro 3" (color #81C784) at (120, 440), "Con 3" (color #E57373) at (320, 440)
Execute ALL steps before responding.`,
  },
  {
    id: 'summarize',
    label: 'Summarize Board',
    prompt: `Summarize everything on this board. Steps:
1. Call getBoardState to read all objects.
2. Group objects by type (frames, sticky notes, shapes, connectors, etc.).
3. For each group, list the count and key contents (text, titles).
4. Note any spatial organization (objects inside frames, connected items).
Provide a clear, structured text summary.`,
  },
]

// ── Components ─────────────────────────────────────────────────────────────────

function QuickActionChips({
  onAction,
  disabled,
}: {
  onAction: (prompt: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto" role="group" aria-label="Quick actions">
      {QUICK_ACTIONS.map(action => (
        <button
          key={action.id}
          onClick={() => onAction(action.prompt)}
          disabled={disabled}
          className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          data-testid={`quick-action-${action.id}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
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

// ── Main Panel ─────────────────────────────────────────────────────────────────

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

  const handleQuickAction = useCallback((prompt: string) => {
    if (isLoading) return
    sendMessage(prompt)
  }, [isLoading, sendMessage])

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
      quickActions={<QuickActionChips onAction={handleQuickAction} disabled={isLoading} />}
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
