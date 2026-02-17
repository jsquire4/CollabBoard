export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-8 py-16 text-center">
      <div className="mb-4 rounded-full bg-indigo-100 p-4">
        <svg
          className="h-12 w-12 text-indigo-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No boards yet</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-600">
        Create your first board to start collaborating. Add shapes, sticky notes, and invite your team.
      </p>
    </div>
  )
}
