'use client'

export interface ApiObjectPanelProps {
  objectId: string
  isOpen: boolean
  onClose: () => void
}

export function ApiObjectPanel({ isOpen, onClose }: ApiObjectPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed z-50 w-80 rounded-xl bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-sm font-semibold text-slate-700">API Configuration</span>
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

      {/* Form — disabled stub, wiring in Phase 2 */}
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
          <select
            disabled
            defaultValue="GET"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Endpoint URL</label>
          <input
            type="text"
            disabled
            placeholder="https://api.example.com/endpoint"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
          />
        </div>
        <p className="text-xs text-slate-400">
          Authentication, headers, and body configuration available in Phase 2.
        </p>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          disabled
          className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium opacity-40 cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  )
}
