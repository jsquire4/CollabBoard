'use client'

export interface CommentThreadProps {
  objectId: string
  boardId: string
  position: { x: number; y: number }
  isOpen: boolean
  onClose: () => void
}

export function CommentThread({ isOpen, position, onClose }: CommentThreadProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed z-50 w-72 rounded-lg bg-parchment shadow-xl border border-parchment-border flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-parchment-border bg-parchment-dark">
        <span className="text-sm font-semibold text-charcoal">Comments</span>
        <div className="flex items-center gap-2">
          <button
            disabled
            className="text-xs px-2 py-1 rounded border border-parchment-border text-charcoal/40 cursor-not-allowed"
            title="Resolve coming in Phase 2"
          >
            Resolve
          </button>
          <button
            onClick={onClose}
            className="text-charcoal/60 hover:text-charcoal/60 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 min-h-24 p-4 overflow-y-auto">
        <p className="text-xs text-charcoal/40 text-center">No comments yet.</p>
      </div>

      {/* Reply input */}
      <div className="border-t border-parchment-border p-3 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded border border-parchment-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-navy/40"
          rows={2}
          placeholder="Add a comment…"
          disabled
        />
        <button
          disabled
          className="px-3 py-2 rounded bg-navy text-parchment text-sm font-medium opacity-40 cursor-not-allowed"
        >
          Reply
        </button>
      </div>
    </div>
  )
}
