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
    prompt: `Create a SWOT Analysis template on the board.

1. Call computePlacement with width=820, height=620, gridRows=2, gridCols=2, padding=20. This returns an origin and 4 cells.
2. Create a frame titled "SWOT Analysis" (width 820, height 620) at the returned origin.
3. Create 4 rectangles using the cell coordinates:
   - Cell 0 (top-left): "Strengths" color #81C784
   - Cell 1 (top-right): "Weaknesses" color #E57373
   - Cell 2 (bottom-left): "Opportunities" color #4FC3F7
   - Cell 3 (bottom-right): "Threats" color #FFB74D
   Each rectangle's x, y, width, height come directly from the cell.
4. Place one sticky note at each cell's centerX/centerY.

Execute ALL steps before responding.`,
  },
  {
    id: 'journey',
    label: 'User Journey',
    prompt: `Create a User Journey Map template on the board.

1. Call computePlacement with width=1200, height=400, gridRows=1, gridCols=5, padding=20. This returns an origin and 5 cells.
2. Create a frame titled "User Journey Map" (width 1200, height 400) at the returned origin.
3. Create 5 rectangles using the cell coordinates:
   - Cell 0: "Awareness" color #CE93D8
   - Cell 1: "Consideration" color #4FC3F7
   - Cell 2: "Decision" color #81C784
   - Cell 3: "Onboarding" color #FFB74D
   - Cell 4: "Retention" color #FFEB3B
   Each rectangle's x, y, width, height come directly from the cell.
4. Place one sticky note at each cell's centerX/centerY with placeholder text:
   - "User discovers product" in cell 0
   - "User evaluates options" in cell 1
   - "User makes a choice" in cell 2
   - "User gets started" in cell 3
   - "User stays engaged" in cell 4

Execute ALL steps before responding.`,
  },
  {
    id: 'retro',
    label: 'Retrospective',
    prompt: `Create a Retrospective template on the board with 3 columns.

1. Call computePlacement with width=1090, height=500, gridRows=1, gridCols=3, padding=20. This returns an origin and 3 cells.
2. Create 3 frames using the cell coordinates:
   - Cell 0: "What went well" color #81C784
   - Cell 1: "What could improve" color #E57373
   - Cell 2: "Action items" color #4FC3F7
   Each frame's x, y, width, height come directly from the cell.
3. Place 2 placeholder sticky notes inside each frame (use the cell's x/y as a reference, offset down for the second note):
   - "Great teamwork on X" and "Shipped feature Y on time" in cell 0
   - "Slow code reviews" and "Unclear requirements" in cell 1
   - "Set up review SLA" and "Write acceptance criteria template" in cell 2

Execute ALL steps before responding.`,
  },
  {
    id: 'grid',
    label: 'Arrange in Grid',
    prompt: `Arrange all objects on the board in a tidy grid layout using layoutObjects. Confirm briefly when done.`,
  },
  {
    id: 'sticky-grid',
    label: '2x3 Sticky Grid',
    prompt: `Create a 2x3 grid of sticky notes for pros/cons analysis.

1. Call computePlacement with width=500, height=500, gridRows=3, gridCols=2, padding=20. This returns an origin and 6 cells.
2. Create a frame titled "Pros & Cons" (width 500, height 500) at the returned origin.
3. Create 6 sticky notes using the cell coordinates:
   - Cell 0 (row 0, left): "Pro 1" color #81C784
   - Cell 1 (row 0, right): "Con 1" color #E57373
   - Cell 2 (row 1, left): "Pro 2" color #81C784
   - Cell 3 (row 1, right): "Con 2" color #E57373
   - Cell 4 (row 2, left): "Pro 3" color #81C784
   - Cell 5 (row 2, right): "Con 3" color #E57373
   Each note placed at the cell's centerX/centerY.

Execute ALL steps before responding.`,
  },
  {
    id: 'summarize',
    label: 'Summarize Board',
    prompt: `Give me a brief, high-level summary of what's on this board — what it's about, how it's organized, and any key content worth highlighting. Keep it short and useful.`,
  },
]

// ── Components ─────────────────────────────────────────────────────────────────

function QuickActionChips({
  onAction,
  disabled,
}: {
  onAction: (prompt: string, label: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2" role="group" aria-label="Quick actions">
      {QUICK_ACTIONS.map(action => (
        <button
          key={action.id}
          onClick={() => onAction(action.prompt, action.label)}
          disabled={disabled}
          className="px-2.5 py-1 text-xs font-medium rounded-full border border-parchment-border text-charcoal bg-parchment-dark/30 hover:bg-parchment-dark/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          <span className={`text-xs text-charcoal/50 mb-1 ${isRight ? 'text-right' : 'text-left'}`}>
            {attribution}
          </span>
        )}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isRight
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

  const handleQuickAction = useCallback((prompt: string, label: string) => {
    if (isLoading) return
    sendMessage(prompt, label)
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
      className="flex items-center justify-between px-4 py-3 border-b border-parchment-border bg-parchment-dark/40 shrink-0 select-none rounded-t-lg"
      style={{ cursor: 'grab' }}
      onMouseDown={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-charcoal">Board Assistant</span>
        <span className="text-xs text-charcoal/40">· shared</span>
      </div>
      <button
        onClick={onClose}
        className="text-charcoal/40 hover:text-charcoal transition-colors"
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
      className="fixed z-50 w-80 rounded-lg bg-parchment border border-parchment-border overflow-hidden"
      style={{ left: pos.x, top: pos.y, maxHeight: '70vh', boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)' }}
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
