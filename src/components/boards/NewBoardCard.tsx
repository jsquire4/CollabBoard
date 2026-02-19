'use client'

interface NewBoardCardProps {
  isCreating: boolean
  newName: string
  onNameChange: (value: string) => void
  onCreate: () => void
  onCancel: () => void
  onClick: () => void
  dark?: boolean
}

export function NewBoardCard({
  isCreating,
  newName,
  onNameChange,
  onCreate,
  onCancel,
  onClick,
  dark = false,
}: NewBoardCardProps) {
  const dk = dark

  if (isCreating) {
    return (
      <div
        className={`flex min-h-[280px] flex-col justify-center rounded-xl border-2 border-dashed p-5 ${
          dk ? 'border-slate-600 bg-slate-900/50' : 'border-slate-300 bg-slate-50/50'
        }`}
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
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${
            dk ? 'border-slate-600 bg-slate-800 text-white placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900'
          }`}
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
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              dk ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
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
      className={`flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        dk
          ? 'border-slate-600 bg-slate-900 text-slate-400 hover:border-indigo-400 hover:bg-slate-800 hover:text-indigo-400 focus:ring-offset-slate-950'
          : 'border-slate-300 bg-white text-slate-500 hover:border-indigo-300 hover:bg-slate-50 hover:text-indigo-600'
      }`}
    >
      <svg className="mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-sm font-medium">New Board</span>
    </button>
  )
}
