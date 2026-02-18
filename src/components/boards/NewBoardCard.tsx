'use client'

interface NewBoardCardProps {
  isCreating: boolean
  newName: string
  onNameChange: (value: string) => void
  onCreate: () => void
  onCancel: () => void
  onClick: () => void
}

export function NewBoardCard({
  isCreating,
  newName,
  onNameChange,
  onCreate,
  onCancel,
  onClick,
}: NewBoardCardProps) {
  if (isCreating) {
    return (
      <div
        className="flex min-h-[280px] flex-col justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCreate()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Board name"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-70"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-slate-500 transition hover:border-indigo-300 hover:bg-slate-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >
      <svg className="mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-sm font-medium">New Board</span>
    </button>
  )
}
