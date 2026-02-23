'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useAgentChat, type ChatMessage } from '@/hooks/useAgentChat'
import { useBoardContext } from '@/contexts/BoardContext'
import { AgentChatLayout } from './AgentChatLayout'

export interface GlobalAgentPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
  viewportCenter?: { x: number; y: number }
}

const PANEL_WIDTH = 320
const PANEL_HEIGHT_MAX_RATIO = 0.7 // 70vh

// ── Quick Actions ──────────────────────────────────────────────────────────────

interface QuickAction {
  id: string
  label: string
  prompt: string
  /** Min selected objects to show (undefined = always). */
  minSelection?: number
  /** When minSelection=1 and single selection, show only if selected object is a group. */
  requiresGroup?: boolean
  /** When minSelection=1 and single selection, show only if selected object is a table. */
  requiresTable?: boolean
}

const QUICK_ACTIONS: QuickAction[] = [
  // Create (always visible)
  { id: 'sticky', label: 'Add Sticky Note', prompt: 'Add a sticky note on the board. Use precomputed placements or call precomputePlacements.' },
  { id: 'rectangle', label: 'Add Rectangle', prompt: 'Add a rectangle shape on the board.' },
  { id: 'frame', label: 'Add Frame', prompt: 'Add a frame on the board to group objects.' },
  { id: 'table', label: 'Add Table', prompt: 'Add a 3x3 table on the board.' },
  // Layout (selection-required)
  {
    id: 'grid',
    label: 'Arrange in Grid',
    prompt: 'Arrange the selected objects in a tidy grid layout using layoutObjects with objectIds. Confirm briefly when done.',
    minSelection: 1,
  },
  {
    id: 'horizontal',
    label: 'Arrange Horizontally',
    prompt: 'Arrange the selected objects in a horizontal row using layoutObjects with objectIds and layout: "horizontal".',
    minSelection: 2,
  },
  {
    id: 'vertical',
    label: 'Arrange Vertically',
    prompt: 'Arrange the selected objects in a vertical column using layoutObjects with objectIds and layout: "vertical".',
    minSelection: 2,
  },
  {
    id: 'circle',
    label: 'Arrange in Circle',
    prompt: 'Arrange the selected objects in a circle using layoutObjects with objectIds and layout: "circle".',
    minSelection: 2,
  },
  // Templates
  {
    id: 'swot',
    label: 'SWOT Analysis',
    prompt: `Create a SWOT Analysis template on the board.

1. Use the precomputed placement for this action (origin + 4 cells), or call precomputePlacements with quickActionIds for the current request.
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

1. Use the precomputed placement for this action (origin + 5 cells), or call precomputePlacements with quickActionIds for the current request.
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

1. Use the precomputed placement for this action (origin + 3 cells), or call precomputePlacements with quickActionIds for the current request.
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
    id: 'sticky-grid',
    label: '2x3 Sticky Grid',
    prompt: `Create a 2x3 grid of sticky notes for pros/cons analysis.

1. Use the precomputed placement for this action (origin + 6 cells), or call precomputePlacements with quickActionIds for the current request.
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
  // Edit
  {
    id: 'color-all',
    label: 'Recolor Selected',
    prompt: 'Change the color of the selected objects to a single color. Use changeColor for each selected object.',
    minSelection: 1,
  },
  { id: 'delete-empty', label: 'Delete Empty Notes', prompt: 'Delete all sticky notes that have no text. Use getBoardState to find them, then deleteObject for each.' },
  // Organize (selection-required)
  {
    id: 'duplicate',
    label: 'Duplicate',
    prompt: 'Duplicate the selected objects. Use duplicateObject for each.',
    minSelection: 1,
  },
  {
    id: 'group',
    label: 'Group',
    prompt: 'Group the selected objects. Use groupObjects with the selected object IDs.',
    minSelection: 2,
  },
  {
    id: 'ungroup',
    label: 'Ungroup',
    prompt: 'Ungroup the selected group. Use ungroupObjects with the group ID.',
    minSelection: 1,
    requiresGroup: true,
  },
  {
    id: 'bring-front',
    label: 'Bring to Front',
    prompt: 'Bring the selected objects to the front. Use updateZIndex with action "front" for each.',
    minSelection: 1,
  },
  {
    id: 'send-back',
    label: 'Send to Back',
    prompt: 'Send the selected objects to the back. Use updateZIndex with action "back" for each.',
    minSelection: 1,
  },
  // Table (selection-required: single table selected)
  {
    id: 'read-table',
    label: 'Read Table',
    prompt: 'Read and summarize the selected table. Use getTableData with the table object id.',
    minSelection: 1,
    requiresTable: true,
  },
  {
    id: 'add-table-row',
    label: 'Add Table Row',
    prompt: 'Add a row to the selected table. Use addTableRow with the table object id.',
    minSelection: 1,
    requiresTable: true,
  },
  {
    id: 'update-table-cell',
    label: 'Update Table Cell',
    prompt: 'Update a specific cell in the selected table. Use getTableData first to understand structure, then updateTableCell with rowIndex and colIndex (0-based).',
    minSelection: 1,
    requiresTable: true,
  },
  // Query
  {
    id: 'summarize',
    label: 'Summarize Board',
    prompt: `Give me a brief, high-level summary of what's on this board — what it's about, how it's organized, and any key content worth highlighting. Keep it short and useful.`,
  },
  { id: 'describe-image', label: 'Describe Image', prompt: 'Describe the image in the object the user points to. Use describeImage with the objectId.' },
]

/** Injected when user sends 2+ quick actions — requires agent to pause and assess before executing. */
const MULTI_ACTION_INFERENCE = `STOP — Before executing anything:

The user has queued multiple requests. Do NOT blindly execute them all. First assess:

1. **Does this combination make sense?** Random or contradictory mixes (e.g. SWOT + Add Frame + Arrange Circle with no selection) often mean the user added things by accident or is exploring. Ask: "I see several different actions here — what are you trying to accomplish? I can help structure this or run them one by one."

2. **Is the intent clear?** If the requests could be done in different ways or the mix seems incoherent, ask a brief clarifying question. Offer to: (a) run them as a structured plan, (b) run them one by one, or (c) focus on a subset.

3. **Only execute when confident.** If you're unsure, ask. Do not guess. A short question is better than creating a board full of unrelated objects.

---

`

// ── Components ─────────────────────────────────────────────────────────────────

interface PendingAction {
  key: string
  id: string
  label: string
  prompt: string
}

function QuickActionsMenu({
  onAddToPending,
  disabled,
  selectedIds,
  objects,
}: {
  onAddToPending: (action: { id: string; label: string; prompt: string }) => void
  disabled: boolean
  selectedIds: Set<string>
  objects: Map<string, { type?: string }>
}) {
  const [open, setOpen] = useState(false)

  const visibleActions = useMemo(() => {
    return QUICK_ACTIONS.filter(action => {
      if (action.minSelection === undefined || action.minSelection === 0) return true
      if (selectedIds.size < action.minSelection) return false
      if (action.requiresGroup) {
        return Array.from(selectedIds).some(id => objects.get(id)?.type === 'group')
      }
      if (action.requiresTable) {
        return Array.from(selectedIds).some(id => objects.get(id)?.type === 'table')
      }
      return true
    })
  }, [selectedIds, objects])

  return (
    <div className="shrink-0 border-t border-parchment-border p-3">
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
                onClick={() => onAddToPending({ id: action.id, label: action.label, prompt: action.prompt })}
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
            <span className="inline-flex items-center gap-1.5" aria-label="Thinking…">
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

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    const hasPills = pendingQuickActions.length > 0
    if (!trimmed && !hasPills) return

    let message: string
    let displayText: string
    let quickActionIds: string[]

    if (hasPills) {
      // Deduplicate: group by action id, include each prompt once (reduces context when same action added multiple times)
      const byId = new Map<string, { label: string; prompt: string; count: number }>()
      for (const a of pendingQuickActions) {
        const existing = byId.get(a.id)
        if (existing) {
          existing.count += 1
        } else {
          byId.set(a.id, { label: a.label, prompt: a.prompt, count: 1 })
        }
      }
      // Full list (with duplicates) for API placement precomputation; message stays deduplicated
      quickActionIds = pendingQuickActions.map(a => a.id)
      const inferenceBlock = pendingQuickActions.length >= 2 ? MULTI_ACTION_INFERENCE : ''
      const actionBlock = Array.from(byId.entries())
        .map(([id, { label, prompt, count }], i) => {
          const header = count > 1 ? `${i + 1}. ${label} (×${count}):` : `${i + 1}. ${label}:`
          return `${header}\n${prompt}`
        })
        .join('\n\n')
      message = inferenceBlock + actionBlock + (trimmed ? `\n\n---\n\n${trimmed}` : '')
      displayText = pendingQuickActions.map(a => a.label).join(', ') + (trimmed ? ` — ${trimmed}` : '')
    } else {
      message = trimmed
      displayText = trimmed
      quickActionIds = []
    }

    sendMessage(message, displayText, quickActionIds.length > 0 ? quickActionIds : undefined)
    setInput('')
    setPendingQuickActions([])
  }, [input, pendingQuickActions, sendMessage])

  const handleAddToPending = useCallback((action: { id: string; label: string; prompt: string }) => {
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
      inputPlaceholder="Ask the board assistant… (Enter to send)"
      pendingPills={pendingQuickActions.map(a => ({ id: a.key, label: a.label }))}
      onRemovePending={handleRemovePending}
      onSend={handleSend}
    />
  )
}
