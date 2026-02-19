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
  const dk = uiDarkMode

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onReset}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm backdrop-blur transition ${
          dk
            ? 'border-slate-700 bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            : 'border-slate-200 bg-white/95 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
        title="Reset view (Ctrl+0)"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        </svg>
      </button>
      <div className={`flex items-center gap-0.5 rounded-lg border shadow-sm backdrop-blur ${
        dk ? 'border-slate-700 bg-slate-900/95' : 'border-slate-200 bg-white/95'
      }`}>
        <button
          type="button"
          onClick={onZoomOut}
          className={`flex h-8 w-8 items-center justify-center rounded-l-md transition ${
            dk ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Zoom out"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span
          className={`min-w-[3.5rem] px-2 py-1.5 text-center text-sm font-medium ${dk ? 'text-slate-300' : 'text-slate-700'}`}
        >
          {percent}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className={`flex h-8 w-8 items-center justify-center rounded-r-md transition ${
            dk ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          title="Zoom in"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
