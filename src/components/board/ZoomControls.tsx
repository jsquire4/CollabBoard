'use client'

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  uiDarkMode?: boolean
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onReset, uiDarkMode = false }: ZoomControlsProps) {
  const percent = Math.round(scale * 100)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onReset}
        className="flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm backdrop-blur transition border-parchment-border bg-parchment/95 text-charcoal/70 hover:bg-parchment-dark hover:text-charcoal dark:border-white/10 dark:bg-[#111827]/95 dark:text-parchment/60 dark:hover:bg-white/10 dark:hover:text-parchment"
        title="Reset view (Ctrl+0)"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        </svg>
      </button>
      <div className="flex items-center gap-0.5 rounded-lg border shadow-sm backdrop-blur border-parchment-border bg-parchment/95 dark:border-white/10 dark:bg-[#111827]/95">
        <button
          type="button"
          onClick={onZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-l-md transition text-charcoal/70 hover:bg-parchment-dark hover:text-charcoal dark:text-parchment/60 dark:hover:bg-white/10 dark:hover:text-parchment"
          title="Zoom out"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" />
          </svg>
        </button>
        <span
          className="min-w-[3.5rem] px-2 py-1.5 text-center text-sm font-medium text-charcoal dark:text-parchment/80"
        >
          {percent}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-r-md transition text-charcoal/70 hover:bg-parchment-dark hover:text-charcoal dark:text-parchment/60 dark:hover:bg-white/10 dark:hover:text-parchment"
          title="Zoom in"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
