'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useComments, type Comment } from '@/hooks/useComments'

export interface CommentThreadProps {
  objectId: string
  boardId: string
  position: { x: number; y: number }
  isOpen: boolean
  onClose: () => void
}

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
        <span className="text-xs font-medium text-slate-600">
          {comment.user_display_name ?? 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{formatRelativeTime(comment.created_at)}</span>
          {!isResolved && (
            <button
              onClick={() => onResolve(comment.id)}
              className="text-xs text-slate-400 hover:text-emerald-600 transition-colors"
              aria-label="Resolve comment"
            >
              Resolve
            </button>
          )}
          {isResolved && (
            <span className="text-xs text-emerald-500">Resolved</span>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {comment.content}
      </div>
    </div>
  )
}

export function CommentThread({
  objectId,
  boardId,
  position,
  isOpen,
  onClose,
}: CommentThreadProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  if (!isOpen) return null

  return (
    <div
      className="fixed z-50 w-72 rounded-lg bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y, maxHeight: '60vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <span className="text-sm font-semibold text-slate-700">Comments</span>
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

      {/* Comments list */}
      <div className="flex-1 min-h-24 p-4 overflow-y-auto">
        {isLoading && (
          <p className="text-xs text-slate-400 text-center">Loading comments…</p>
        )}
        {!isLoading && comments.length === 0 && (
          <p className="text-xs text-slate-400 text-center">No comments yet.</p>
        )}
        {comments.map(comment => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            onResolve={resolveComment}
          />
        ))}
        {error && (
          <p className="text-xs text-red-500 text-center mt-2">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div className="border-t border-slate-100 p-3 flex gap-2 shrink-0">
        <textarea
          className="flex-1 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
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
          className="px-3 py-2 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reply
        </button>
      </div>
    </div>
  )
}
