'use client'

export interface FileLibraryPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
}

export function FileLibraryPanel({ isOpen, onClose }: FileLibraryPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed right-4 top-16 z-50 w-72 rounded-xl bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-sm font-semibold text-slate-700">File Library</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Upload button */}
      <div className="px-4 pt-3">
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400 cursor-not-allowed"
          title="Upload coming in Phase 2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload File
        </button>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
        <svg className="w-10 h-10 text-slate-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-slate-400 text-center">No files yet.</p>
        <p className="text-xs text-slate-300 text-center mt-1">Files uploaded to this board will appear here.</p>
      </div>
    </div>
  )
}
