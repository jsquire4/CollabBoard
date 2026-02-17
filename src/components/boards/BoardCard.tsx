'use client'

import { BoardWithRole } from '@/types/sharing'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
}

interface BoardCardProps {
  board: BoardWithRole
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(board.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onNavigate(board.id)
      }}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
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
            className="flex-1 rounded border border-indigo-500 px-2 py-1 text-base font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        ) : (
          <h3
            className="flex-1 text-base font-semibold text-slate-900"
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
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(board.id, board.name)
                }}
                className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
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
                className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                title="Delete board"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
          {!isOwner && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onLeave(board.id)
              }}
              className="rounded px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              title="Leave board"
            >
              Leave
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Updated {new Date(board.updated_at).toLocaleDateString()}
        </p>
        {!isOwner && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {ROLE_LABELS[board.role]}
          </span>
        )}
      </div>
    </div>
  )
}
