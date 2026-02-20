'use client'

import { useEffect, useRef, useState } from 'react'
import { BoardWithRole, BoardCardSummary } from '@/types/sharing'
import { useBoardPresenceCount, type BoardPresenceUser } from '@/hooks/useBoardPresenceCount'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
}

const ROLE_STYLES: Record<string, string> = {
  owner: 'bg-navy/10 text-navy',
  manager: 'bg-brg/10 text-brg',
  editor: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-parchment-dark text-charcoal/60',
}

function formatLastUpdated(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffSec < 60) return '< 1 minute ago'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  return new Date(isoDate).toLocaleDateString()
}

interface BoardCardProps {
  board: BoardWithRole & { summary?: BoardCardSummary }
  editingId: string | null
  editName: string
  onEditNameChange: (value: string) => void
  onRename: (id: string) => void
  onEditingCancel: () => void
  onDoubleClickTitle: (board: BoardWithRole) => void
  onDuplicate: (boardId: string, boardName: string) => void
  onDelete: (boardId: string) => void
  onLeave: (boardId: string) => void
  onNavigate: (boardId: string) => void
}

const STATUS_LABELS: Record<'active' | 'idle' | 'offline', string> = {
  active: 'Online',
  idle: 'Away',
  offline: 'Offline',
}

function StatusDot({ status }: { status: 'active' | 'idle' | 'offline' }) {
  const colors = {
    active: 'bg-emerald-500',
    idle: 'bg-amber-400',
    offline: 'bg-slate-300',
  }
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[status]}`}
      title={STATUS_LABELS[status]}
    />
  )
}

function MemberList({
  summary,
  onlineUsers,
  excludeOwnerId,
}: {
  summary?: BoardCardSummary
  onlineUsers: BoardPresenceUser[]
  excludeOwnerId?: string
}) {
  if (!summary) return null

  const filtered = excludeOwnerId
    ? summary.members.filter((m) => m.user_id !== excludeOwnerId)
    : summary.members

  const onlineMap = new Map(onlineUsers.map((u) => [u.user_id, u]))
  const sorted = [...filtered].sort((a, b) => (a.is_anonymous === b.is_anonymous ? 0 : a.is_anonymous ? 1 : -1))
  const total = sorted.length
  const showOthers = total > 5
  const toShow = showOthers ? sorted.slice(0, 4) : sorted

  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-navy">Collaborators</p>
      {filtered.length === 0 ? (
        <p className="text-xs text-charcoal/40">No collaborators yet</p>
      ) : (
      <ul className="space-y-1">
        {toShow.map((m) => {
          const presence = onlineMap.get(m.user_id)
          const status: 'active' | 'idle' | 'offline' = presence
            ? (presence.status ?? 'active')
            : 'offline'
          const label = m.is_anonymous ? 'Anonymous' : m.display_name || 'Unknown'
          const statusLabel = STATUS_LABELS[status]
          return (
            <li key={m.user_id} className="flex items-center gap-2 text-xs text-charcoal/70">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="w-14 shrink-0 text-right text-charcoal/50">{statusLabel}</span>
              <StatusDot status={status} />
            </li>
          )
        })}
        {showOthers && (
          <li className="flex items-center gap-2 text-xs text-charcoal/40">
            <span className="min-w-0 flex-1 truncate">+ {total - 4} others</span>
            <span className="w-14 shrink-0" />
          </li>
        )}
      </ul>
      )}
    </div>
  )
}

export function BoardCard({
  board,
  editingId,
  editName,
  onEditNameChange,
  onRename,
  onEditingCancel,
  onDoubleClickTitle,
  onDuplicate,
  onDelete,
  onLeave,
  onNavigate,
}: BoardCardProps) {
  const isOwner = board.role === 'owner'
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '100px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { count: onlineCount, onlineUsers } = useBoardPresenceCount(board.id, { enabled: isVisible })

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(board.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onNavigate(board.id)
      }}
      className="group flex min-h-[280px] cursor-pointer flex-col rounded-xl border border-parchment-border bg-parchment-dark p-5 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 hover:border-navy/30 hover:shadow-md"
    >
      {/* Title row: board name + role badge (right aligned) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingId === board.id ? (
            <input
              autoFocus
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename(board.id)
                if (e.key === 'Escape') onEditingCancel()
              }}
              onBlur={() => onRename(board.id)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded border border-navy px-2 py-1 text-base font-semibold outline-none focus:ring-2 focus:ring-navy/20"
            />
          ) : (
            <h3
              className="min-w-0 flex-1 truncate text-base font-semibold text-charcoal"
              onDoubleClick={(e) => {
                if (!isOwner) return
                e.stopPropagation()
                onDoubleClickTitle(board)
              }}
              title={isOwner ? 'Double-click to rename' : undefined}
            >
              {board.name}
            </h3>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[board.role] ?? ROLE_STYLES.viewer}`}>
            {ROLE_LABELS[board.role]}
          </span>
        </div>
      </div>

      {/* Collaborators section — flex-1 so "Current board viewers" stays fixed relative to card height */}
      <div className="mt-2 flex min-h-[120px] flex-1 flex-col">
        <MemberList
          summary={board.summary}
          onlineUsers={onlineUsers}
          excludeOwnerId={isOwner ? board.created_by : undefined}
        />
        {/* Separator + current viewers — fixed at bottom of collaborators area */}
        <div className="mt-auto border-t border-parchment-border pt-3">
          <p className="text-xs text-charcoal/50">
            {onlineCount} viewing now
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-2">
        <p className="text-xs text-charcoal/40" suppressHydrationWarning>
          Last updated {formatLastUpdated(board.updated_at)}
        </p>
        {isOwner ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(board.id, board.name)
              }}
              className="rounded p-1.5 text-charcoal/40 transition hover:bg-parchment hover:text-charcoal"
              title="Duplicate board"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 10a2 2 0 002 2h2a2 2 0 002-2v-2m0 10V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(board.id)
              }}
              className="rounded p-1.5 text-charcoal/40 transition hover:bg-red-50 hover:text-red-600"
              title="Delete board"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onLeave(board.id)
            }}
            className="rounded border border-charcoal/20 px-2 py-1 text-xs font-medium text-charcoal/50 transition hover:border-charcoal/40 hover:text-charcoal"
            title="Leave board"
          >
            Leave
          </button>
        )}
      </div>
    </div>
  )
}
