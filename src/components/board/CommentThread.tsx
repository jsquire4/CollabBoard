'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useComments, type Comment } from '@/hooks/useComments'

export interface CommentThreadProps {
  objectId: string
  boardId: string
  position: { x: number; y: number }
  origin?: { x: number; y: number }
  isOpen: boolean
  onClose: () => void
}

const EASING = 'cubic-bezier(.34,1.56,.64,1)'
const SHADOW = '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)'

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function CommentBubble({
  comment,
  onResolve,
}: {
  comment: Comment
  onResolve: (id: string) => void
}) {
  const isResolved = !!comment.resolved_at
  return (
    <div className={`mb-3 ${isResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-charcoal/70">
          {comment.user_display_name ?? 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-charcoal/40">{formatRelativeTime(comment.created_at)}</span>
          {!isResolved && (
            <button
              onClick={() => onResolve(comment.id)}
              className="text-xs text-charcoal/40 hover:text-emerald-600 transition-colors"
              aria-label="Resolve comment"
            >
              Resolve
            </button>
          )}
          {isResolved && (
            <span className="text-xs text-emerald-600">Resolved</span>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-parchment-dark/60 border border-parchment-border px-3 py-2 text-sm text-charcoal">
        {comment.content}
      </div>
    </div>
  )
}

const MIN_WIDTH = 240
const MIN_HEIGHT = 200

export function CommentThread({
  objectId,
  boardId,
  position,
  origin,
  isOpen,
  onClose,
}: CommentThreadProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Draggable + resizable state
  const [pos, setPos] = useState(position)
  const [size, setSize] = useState({ width: 288, height: 400 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)

  // Emerge animation state
  const [emerged, setEmerged] = useState(false)
  const rafRef = useRef(0)

  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setEmerged(true))
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(rafRef.current) }
  }, [])

  // Sync position when the prop changes (e.g. opening on a different shape)
  useEffect(() => {
    setPos(position)
  }, [position.x, position.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const { comments, isLoading, error, addComment, resolveComment } = useComments({
    boardId,
    objectId,
    enabled: isOpen,
  })

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    await addComment(trimmed)
  }, [input, addComment])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  // ── Drag handling (header) ────────────────────────────────────────────────
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({
        x: Math.max(0, Math.min(dragRef.current.origX + dx, window.innerWidth - 100)),
        y: Math.max(0, Math.min(dragRef.current.origY + dy, window.innerHeight - 50)),
      })
    }
    const handleMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [pos.x, pos.y])

  // ── Resize handling (bottom-right corner) ─────────────────────────────────
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.width, origH: size.height }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const dx = ev.clientX - resizeRef.current.startX
      const dy = ev.clientY - resizeRef.current.startY
      setSize({
        width: Math.max(MIN_WIDTH, resizeRef.current.origW + dx),
        height: Math.max(MIN_HEIGHT, resizeRef.current.origH + dy),
      })
    }
    const handleMouseUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [size.width, size.height])

  if (!isOpen) return null

  // Compute emerge transform: translate from origin to final position + scale up
  const emergeTransform = (() => {
    if (emerged) return 'scale(1) translate(0, 0)'
    if (origin) {
      const dx = origin.x - pos.x
      const dy = origin.y - pos.y
      return `scale(0.05) translate(${dx}px, ${dy}px)`
    }
    return 'scale(0.05)'
  })()

  return (
    <div
      className="fixed z-50 rounded-lg bg-parchment border border-parchment-border flex flex-col overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        boxShadow: SHADOW,
        opacity: emerged ? 1 : 0,
        transform: emergeTransform,
        transformOrigin: origin
          ? `${origin.x - pos.x}px ${origin.y - pos.y}px`
          : 'top left',
        transition: `opacity 250ms ${EASING}, transform 300ms ${EASING}`,
      }}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-parchment-border bg-parchment-dark/40 shrink-0 select-none"
        style={{ cursor: 'grab' }}
        onMouseDown={handleDragMouseDown}
      >
        <span className="text-sm font-semibold text-charcoal">Comments</span>
        <button
          onClick={onClose}
          className="text-charcoal/40 hover:text-charcoal transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 min-h-0 p-4 overflow-y-auto">
        {isLoading && (
          <p className="text-xs text-charcoal/40 text-center">Loading comments…</p>
        )}
        {!isLoading && comments.length === 0 && (
          <p className="text-xs text-charcoal/40 text-center">No comments yet.</p>
        )}
        {comments.map(comment => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            onResolve={resolveComment}
          />
        ))}
        {error && (
          <p className="text-xs text-red-400 text-center mt-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div className="border-t border-parchment-border p-3 flex gap-2 shrink-0">
        <textarea
          className="flex-1 resize-none rounded border border-parchment-border bg-white px-3 py-2 text-sm text-charcoal placeholder-charcoal/30 focus:outline-none focus:ring-1 focus:ring-navy/30 disabled:opacity-50"
          rows={2}
          placeholder="Add a comment…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || isLoading}
          className="px-3 py-2 rounded bg-navy text-parchment text-sm font-medium border border-navy hover:bg-navy/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reply
        </button>
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4"
        style={{ cursor: 'nwse-resize' }}
        onMouseDown={handleResizeMouseDown}
      >
        <svg className="w-4 h-4 text-charcoal/15" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 14H10L14 10V14ZM14 8L8 14H6L14 6V8Z" />
        </svg>
      </div>
    </div>
  )
}
