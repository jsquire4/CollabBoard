'use client'

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  const percent = Math.round(scale * 100)

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        className="flex h-8 w-8 items-center justify-center rounded-l-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        title="Zoom out"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onReset}
        className="min-w-[3.5rem] px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        title="Reset zoom"
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className="flex h-8 w-8 items-center justify-center rounded-r-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        title="Zoom in"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
