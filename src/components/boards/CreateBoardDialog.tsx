'use client'

interface CreateBoardDialogProps {
  newName: string
  onNameChange: (value: string) => void
  onCreate: () => void
  onCancel: () => void
  creating: boolean
}

export function CreateBoardDialog({
  newName,
  onNameChange,
  onCreate,
  onCancel,
  creating,
}: CreateBoardDialogProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
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
        className="w-60 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-70"
      >
        {creating ? 'Creating…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  )
}
