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
  const dk = false

  if (isCreating) {
    return (
      <div
        className="flex min-h-[280px] flex-col justify-center rounded-xl border-2 border-dashed border-parchment-border bg-parchment-dark/50 p-5"
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
          className="mb-3 w-full rounded-lg border border-parchment-border bg-parchment px-3 py-2 text-sm text-charcoal outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-navy/90 disabled:cursor-wait disabled:opacity-70"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-parchment-border bg-parchment px-4 py-2 text-sm font-medium text-charcoal/70 transition hover:bg-parchment-dark"
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
      className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-parchment-border bg-parchment p-5 text-charcoal/40 transition focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 hover:border-navy/30 hover:bg-parchment-dark hover:text-navy"
    >
      <svg className="mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-sm font-medium">New Board</span>
    </button>
  )
}
