'use client'

export interface AgentChatPanelProps {
  agentObjectId: string
  boardId: string
  position: { x: number; y: number }
  isOpen: boolean
  onClose: () => void
}

export function AgentChatPanel({ isOpen, position, onClose }: AgentChatPanelProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed z-50 w-80 rounded-lg bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Agent Chat</span>
        </div>
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

      {/* Messages area */}
      <div className="flex-1 min-h-32 p-4 overflow-y-auto">
        <p className="text-xs text-slate-400 text-center">No messages yet.</p>
      </div>

      {/* Input row */}
      <div className="border-t border-slate-100 p-3 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          rows={2}
          placeholder="Ask this agent…"
          disabled
        />
        <button
          disabled
          className="px-3 py-2 rounded bg-indigo-500 text-white text-sm font-medium opacity-40 cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}
