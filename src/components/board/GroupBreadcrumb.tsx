'use client'

interface GroupBreadcrumbProps {
  activeGroupId: string | null
  onExit: () => void
}

export function GroupBreadcrumb({ activeGroupId, onExit }: GroupBreadcrumbProps) {
  if (!activeGroupId) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
      <span className="text-sm text-slate-600">Inside group</span>
      <button
        type="button"
        onClick={onExit}
        className="text-sm font-medium text-indigo-600 transition hover:text-indigo-500"
        title="Exit group (Esc)"
      >
        Exit
      </button>
    </div>
  )
}
