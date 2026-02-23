'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useAgentChat, type ChatMessage } from '@/hooks/useAgentChat'
import { useBoardContext } from '@/contexts/BoardContext'
import { AgentChatLayout } from './AgentChatLayout'
import {
  getVisibleActions,
  getIncompatiblePairs,
  getIncompatibilityReason,
} from '@/lib/agent/actionRegistry'

export interface GlobalAgentPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
  viewportCenter?: { x: number; y: number }
}

const PANEL_WIDTH = 320
const PANEL_HEIGHT_MAX_RATIO = 0.7 // 70vh

// ── Components ─────────────────────────────────────────────────────────────────

interface PendingAction {
  key: string
  id: string
  label: string
}

function QuickActionsMenu({
  onAddToPending,
  disabled,
  selectedIds,
  objects,
}: {
  onAddToPending: (action: { id: string; label: string }) => void
  disabled: boolean
  selectedIds: Set<string>
  objects: Map<string, { type?: string }>
}) {
  const [open, setOpen] = useState(false)

  const visibleActions = useMemo(() => {
    return getVisibleActions(selectedIds, objects)
  }, [selectedIds, objects])

  return (
    <div className="shrink-0 p-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium border border-navy/20 text-charcoal bg-navy/5 hover:bg-navy/10 hover:border-navy/30 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 animate-assistant-pulse"
          aria-haspopup="true"
          data-testid="quick-actions-trigger"
        >
          Quick Actions
        </button>
      ) : (
        <div
          className="border border-navy/15 rounded-lg bg-parchment-dark/20 max-h-40 overflow-y-auto animate-flyout-in"
          role="menu"
          aria-label="Quick actions"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-navy/10 bg-navy/5 rounded-t-lg shrink-0">
            <span className="text-sm font-semibold text-charcoal">Quick Actions</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-parchment-border text-charcoal hover:bg-parchment-dark/60 transition-colors"
              aria-label="Close quick actions"
              data-testid="quick-actions-close"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 p-3">
            {visibleActions.map((action, i) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAddToPending({ id: action.id, label: action.label })}
                disabled={disabled}
                className="px-2.5 py-1 text-xs font-medium rounded-full border border-navy/15 text-charcoal bg-navy/5 hover:bg-brg/10 hover:border-brg/30 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 animate-chip-in"
                style={{ animationDelay: `${i * 25}ms` }}
                role="menuitem"
                data-testid={`quick-action-${action.id}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  const isRight = msg.role === 'user'
  const attribution = msg.user_display_name

  return (
    <div className={`flex ${isRight ? 'justify-end' : 'justify-start'} mb-3 animate-bubble-in`}>
      <div className={`max-w-[85%] ${isRight ? 'items-end' : 'items-start'} flex flex-col`}>
        {attribution && (
          <span className={`text-xs text-charcoal/50 mb-1 ${isRight ? 'text-right' : 'text-left'}`}>
            {attribution}
          </span>
        )}
        <div
          className={`rounded-lg px-3 py-2 text-sm min-h-[2.25rem] flex items-center ${
            isRight
              ? 'bg-navy text-parchment rounded-br-sm shadow-sm'
              : 'bg-parchment-dark/60 border border-parchment-border border-l-2 border-l-brg/40 text-charcoal rounded-bl-sm'
          }`}
        >
          {msg.content || (msg.isStreaming ? (
            <span className="inline-flex items-center gap-1.5" aria-label="Thinking...">
              <span className="h-2 w-1.5 rounded-sm bg-current animate-typing-pulse" />
              <span className="h-2 w-1.5 rounded-sm bg-current animate-typing-pulse [animation-delay:0.15s]" />
              <span className="h-2 w-1.5 rounded-sm bg-current animate-typing-pulse [animation-delay:0.3s]" />
            </span>
          ) : '')}
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export function GlobalAgentPanel({ boardId, isOpen, onClose, viewportCenter }: GlobalAgentPanelProps) {
  const [input, setInput] = useState('')
  const [pendingQuickActions, setPendingQuickActions] = useState<PendingAction[]>([])
  const [comboWarning, setComboWarning] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const ctx = useBoardContext()
  const selectedIds = ctx.selectedIds
  const objects = ctx.objects
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])

  const mode = useMemo(() => ({ type: 'global' as const }), [])
  const { messages, error, sendMessage } = useAgentChat({
    boardId,
    mode,
    enabled: isOpen,
    viewportCenter,
    selectedIds: selectedIdsArray,
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

  // Check incompatibility whenever pending actions change
  useEffect(() => {
    if (pendingQuickActions.length < 2) {
      setComboWarning(null)
      return
    }
    const ids = pendingQuickActions.map(a => a.id)
    const pairs = getIncompatiblePairs(ids)
    if (pairs.length > 0) {
      const [a, b] = pairs[0]!
      const reason = getIncompatibilityReason(a, b)
      setComboWarning(reason ? `Heads up: ${reason}` : null)
    } else {
      setComboWarning(null)
    }
  }, [pendingQuickActions])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    const hasPills = pendingQuickActions.length > 0
    if (!trimmed && !hasPills) return

    let message: string
    let displayText: string
    let quickActionIds: string[]

    if (hasPills) {
      // Send all action IDs in order (including duplicates — e.g. "Add Sticky ×3" = 3 sticky notes)
      quickActionIds = pendingQuickActions.map(a => a.id)

      // Build a simple numbered list of action labels for the message
      const actionBlock = pendingQuickActions
        .map((a, i) => `${i + 1}. ${a.label}`)
        .join('\n')
      message = actionBlock + (trimmed ? `\n\n${trimmed}` : '')
      displayText = pendingQuickActions.map(a => a.label).join(', ') + (trimmed ? ` — ${trimmed}` : '')
    } else {
      message = trimmed
      displayText = trimmed
      quickActionIds = []
    }

    sendMessage(message, displayText, quickActionIds.length > 0 ? quickActionIds : undefined)
    setInput('')
    setPendingQuickActions([])
    setComboWarning(null)
  }, [input, pendingQuickActions, sendMessage])

  const handleAddToPending = useCallback((action: { id: string; label: string }) => {
    setPendingQuickActions(prev => [
      ...prev,
      { key: `${action.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...action },
    ])
  }, [])

  const handleRemovePending = useCallback((key: string) => {
    setPendingQuickActions(prev => prev.filter(a => a.key !== key))
  }, [])

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
    const cleanup = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', cleanup)
      dragCleanupRef.current = null
    }
    dragCleanupRef.current = cleanup
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', cleanup)
  }, [pos])

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => { dragCleanupRef.current?.() }
  }, [])

  if (!isOpen || !pos) return null

  const header = (
    <div
      className="flex items-center justify-between px-4 py-3 border-b border-parchment-border border-l-4 border-l-navy/60 bg-gradient-to-r from-navy/5 via-parchment-dark/40 to-parchment-dark/30 shrink-0 select-none rounded-t-lg"
      style={{ cursor: 'grab' }}
      onMouseDown={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-charcoal">Board Assistant</span>
        <span className="text-xs text-navy/50">· shared</span>
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
      className="fixed z-50 w-80 rounded-lg bg-parchment border border-navy/15 overflow-hidden animate-assistant-in"
      style={{ left: pos.x, top: pos.y, maxHeight: '70vh', boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)' }}
      header={header}
      quickActions={
        <QuickActionsMenu
          onAddToPending={handleAddToPending}
          disabled={false}
          selectedIds={selectedIds}
          objects={objects}
        />
      }
      messages={messages}
      renderMessage={msg => <MessageRow key={msg.id} msg={msg} />}
      emptyText="Start a conversation with the board assistant."
      error={error}
      input={input}
      onInputChange={setInput}
      inputPlaceholder="Ask the board assistant... (Enter to send)"
      pendingPills={pendingQuickActions.map(a => ({ id: a.key, label: a.label }))}
      onRemovePending={handleRemovePending}
      onSend={handleSend}
      comboWarning={comboWarning}
    />
  )
}
