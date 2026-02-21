'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useAgentChat } from '@/hooks/useAgentChat'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { BoardFilesList } from './BoardFilesList'
import type { BoardObject } from '@/types/board'

interface ChatPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
  objects?: Map<string, BoardObject>
  onDeleteFile?: (objectId: string, storagePath: string) => void
}

const DEFAULT_WIDTH = 384 // w-96
const DEFAULT_HEIGHT = 500
const PANEL_MIN_WIDTH = 320
const PANEL_MIN_HEIGHT = 300

export function ChatPanel({ boardId, isOpen, onClose, objects, onDeleteFile }: ChatPanelProps) {
  const mode = useMemo(() => ({ type: 'global' as const }), [])
  const { messages, isLoading, error, sendMessage, cancel } = useAgentChat({
    boardId,
    mode,
    enabled: isOpen,
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Initialize position when first opened
  useEffect(() => {
    if (isOpen && pos === null) {
      setPos({
        x: window.innerWidth - DEFAULT_WIDTH - 16,
        y: Math.max(16, (window.innerHeight - DEFAULT_HEIGHT) / 2),
      })
    }
  }, [isOpen, pos])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.width, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy)),
      })
    }
    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [pos, size.width])

  // Resize handlers (drag from bottom-left corner to also reposition)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      origW: size.width, origH: size.height,
      origX: pos.x, origY: pos.y,
    }

    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const dx = ev.clientX - resizeRef.current.startX
      const dy = ev.clientY - resizeRef.current.startY
      setSize({
        width: Math.max(PANEL_MIN_WIDTH, resizeRef.current.origW - dx),
        height: Math.max(PANEL_MIN_HEIGHT, resizeRef.current.origH + dy),
      })
      // Move x position as width changes (resize from left edge)
      const newWidth = Math.max(PANEL_MIN_WIDTH, resizeRef.current.origW - dx)
      setPos(prev => prev ? {
        ...prev,
        x: resizeRef.current!.origX + (resizeRef.current!.origW - newWidth),
      } : prev)
    }
    const handleUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [pos, size])

  if (!isOpen || !pos) return null

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-xl bg-white shadow-2xl dark:bg-slate-800"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* Draggable header */}
      <div
        className="flex cursor-move items-center justify-between rounded-t-xl border-b border-slate-200 px-4 py-2.5 select-none dark:border-slate-600"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-500" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">AI Assistant</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          aria-label="Close chat"
          onMouseDown={e => e.stopPropagation()}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* File list */}
      {objects && <BoardFilesList objects={objects} onDelete={onDeleteFile} />}

      {/* Input */}
      <div className="rounded-b-xl">
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          onCancel={cancel}
        />
      </div>

      {/* Resize handle (bottom-left corner) */}
      <div
        className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize"
        onMouseDown={handleResizeStart}
      >
        <svg className="h-4 w-4 text-slate-300 dark:text-slate-600" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12 16L16 12M8 16L16 8M4 16L16 4" stroke="currentColor" strokeWidth="1.5" fill="none" transform="scale(-1,1) translate(-16,0)" />
        </svg>
      </div>
    </div>
  )
}
