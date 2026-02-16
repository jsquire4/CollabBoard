'use client'

interface ToolbarProps {
  onAddStickyNote: () => void
  onAddRectangle: () => void
  onAddCircle: () => void
}

export function Toolbar({ onAddStickyNote, onAddRectangle, onAddCircle }: ToolbarProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-white/90 backdrop-blur-sm shadow-lg rounded-xl px-4 py-2">
      <button
        onClick={onAddStickyNote}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Sticky Note
      </button>
      <button
        onClick={onAddRectangle}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Rectangle
      </button>
      <button
        onClick={onAddCircle}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Circle
      </button>
    </div>
  )
}
