'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  user_display_name?: string | null
  toolCalls?: { toolName: string; args: unknown }[]
  toolResults?: { toolName: string; result: unknown }[]
  isStreaming?: boolean
}

/**
 * Chat mode:
 * - agent: scoped to a specific agent object (agentObjectId required). Ephemeral — no DB history.
 * - global: scoped to the whole board (agent_object_id IS NULL)
 */
export type AgentChatMode =
  | { type: 'agent'; agentObjectId: string }
  | { type: 'global' }

const PLACEHOLDER_PHRASES = [
  "Got it! Working on that…",
  "On it!",
  "One sec…",
  "Let me handle that.",
  "Working on it…",
  "Got it — give me a moment.",
] as const

const ERROR_MESSAGES = [
  "Sorry, I can't do that right now.",
  "Hmm… something's wrong, please try again later.",
] as const

const pickPlaceholder = () =>
  PLACEHOLDER_PHRASES[Math.floor(Math.random() * PLACEHOLDER_PHRASES.length)]

interface UseAgentChatOptions {
  boardId: string
  mode: AgentChatMode
  enabled?: boolean
  /** Viewport center for position hints (per-agent only) */
  viewportCenter?: { x: number; y: number }
  /** Selected object IDs (global mode) — scopes board state and enables selection tools */
  selectedIds?: string[]
}

export function useAgentChat({ boardId, mode, enabled = true, viewportCenter, selectedIds }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const queueRef = useRef<{
    message: string
    displayText?: string
    quickActionIds: string[]
    assistantId: string
    placeholderContent: string
  }[]>([])
  const greetedRef = useRef(false)
  const loadedRef = useRef(false)
  const messageIdRef = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])

  const nextId = () => `msg-${++messageIdRef.current}`

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // ── Reset when per-agent chat is closed ────────────────────

  const prevEnabledRef = useRef(enabled)
  useEffect(() => {
    if (prevEnabledRef.current && !enabled && mode.type === 'agent') {
      setMessages([])
      loadedRef.current = false
      greetedRef.current = false
      messageIdRef.current = 0
    }
    prevEnabledRef.current = enabled
  }, [enabled, mode.type])

  // ── SSE consumer ──────────────────────────────────────────

  const consumeSSE = useCallback(async (
    response: Response,
    assistantId: string,
    placeholderContent?: string,
  ) => {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let receivedDone = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6)
          if (!json) continue

          try {
            const event = JSON.parse(json)

            if (event.type === 'text-delta') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        placeholderContent && m.content === placeholderContent
                          ? event.text
                          : m.content + event.text,
                    }
                  : m,
              ))
            } else if (event.type === 'tool-call') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls || []), { toolName: event.toolName, args: event.args }] }
                  : m,
              ))
            } else if (event.type === 'tool-result') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolResults: [...(m.toolResults || []), { toolName: event.toolName, result: event.result }] }
                  : m,
              ))
            } else if (event.type === 'done') {
              receivedDone = true
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false }
                  : m,
              ))
            } else if (event.type === 'error') {
              setError(event.error)
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)],
                      isStreaming: false,
                    }
                  : m,
              ))
            }
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    } finally {
      try { reader.cancel() } catch { /* ignore */ }
      if (!receivedDone) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false }
            : m,
        ))
      }
    }
  }, [])

  // ── Send message (queueable) ───────────────────────────────────────────────

  const sendMessage = useCallback(async (
    message: string,
    displayText?: string,
    quickActionIds?: string | string[],
  ) => {
    if (!message.trim()) return

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: displayText ?? message,
    }
    const assistantId = nextId()
    const ids = Array.isArray(quickActionIds) ? quickActionIds : quickActionIds ? [quickActionIds] : []
    const usePlaceholder = ids.length > 0
    const placeholderContent = usePlaceholder ? pickPlaceholder() : ''
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: placeholderContent,
      isStreaming: true,
    }

    if (isLoading) {
      setMessages(prev => [...prev, userMsg, assistantMsg])
      queueRef.current.push({ message, displayText, quickActionIds: ids, assistantId, placeholderContent })
      return
    }

    const processOne = async (
      msg: string,
      asstId: string,
      qaIds?: string[],
      placeholderContent?: string,
      history?: ChatMessage[],
    ) => {
      setError(null)
      setIsLoading(true)

      const abort = new AbortController()
      abortRef.current = abort

      const url = mode.type === 'global'
        ? `/api/agent/${boardId}/global`
        : `/api/agent/${boardId}`

      const queuedPreviews = queueRef.current.map(q =>
        q.displayText ?? (q.message.length > 60 ? q.message.slice(0, 57) + '…' : q.message),
      )

      const requestBody = mode.type === 'global'
        ? {
            message: msg,
            ...(viewportCenter ? { viewportCenter } : {}),
            ...(qaIds && qaIds.length > 0 ? { quickActionIds: qaIds } : {}),
            ...(selectedIds && selectedIds.length > 0 ? { selectedIds } : {}),
            ...(queuedPreviews.length > 0 ? { queuedPreviews } : {}),
            ...(history && history.length > 0
              ? { conversationHistory: history.map(m => ({ role: m.role, content: m.content || '' })) }
              : {}),
          }
        : {
            message: msg,
            agentObjectId: mode.agentObjectId,
            ...(viewportCenter ? { viewportCenter } : {}),
          }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abort.signal,
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }

        await consumeSSE(res, asstId, placeholderContent || undefined)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const errorMsg = (err as Error).message || 'Failed to send message'
        setError(errorMsg)
        const fallbackMsg = ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)]
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: fallbackMsg, isStreaming: false }
            : m,
        ))
      } finally {
        setIsLoading(false)
        abortRef.current = null
        const next = queueRef.current.shift()
        if (next) {
          const msgs = messagesRef.current
          const history = mode.type === 'global' && msgs.length >= 2
            ? msgs.slice(0, -2)
            : undefined
          void processOne(
            next.message,
            next.assistantId,
            next.quickActionIds,
            next.placeholderContent,
            history,
          )
        }
      }
    }

    const history = messagesRef.current
    setMessages(prev => [...prev, userMsg, assistantMsg])
    void processOne(message, assistantId, ids, placeholderContent, history)
  }, [boardId, mode, isLoading, consumeSSE, viewportCenter, selectedIds])

  // ── Load history + greet on mount ─────────────────────────

  useEffect(() => {
    const agentObjectId = mode.type === 'agent' ? mode.agentObjectId : null
    if (!enabled || (mode.type === 'agent' && !agentObjectId) || loadedRef.current) return
    loadedRef.current = true

    const abortController = new AbortController()

    const init = async () => {
      // Per-agent mode: ephemeral — skip history load, just greet
      if (mode.type === 'agent') {
        if (!greetedRef.current) {
          greetedRef.current = true

          const assistantId = nextId()
          setMessages([{
            id: assistantId,
            role: 'assistant',
            content: '',
            isStreaming: true,
          }])

          try {
            const res = await fetch(`/api/agent/${boardId}/greet`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isNewBoard: false }),
              signal: abortController.signal,
            })

            if (res.ok) {
              await consumeSSE(res, assistantId)
            } else {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: 'Welcome! How can I help you with your board?', isStreaming: false }
                  : m,
              ))
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') return
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: 'Welcome! How can I help you with your board?', isStreaming: false }
                : m,
            ))
          }
        }
        return
      }

      // Global mode: load recent history from the OpenAI thread via our API.
      // The Assistants API thread is the single source of truth — no Supabase fallback needed.
      try {
        const res = await fetch(`/api/agent/${boardId}/global/history`, {
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) return

        if (res.ok) {
          const data = await res.json()
          if (data && data.length > 0) {
            const loaded: ChatMessage[] = data.map((row: { id: string; role: string; content: string; user_display_name?: string | null }) => ({
              id: row.id,
              role: row.role as 'user' | 'assistant' | 'system',
              content: row.content,
              user_display_name: row.user_display_name,
            }))
            messageIdRef.current = loaded.length
            setMessages(loaded)
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // Show empty state — thread history will accumulate as user chats
      }
    }

    init()

    return () => {
      abortController.abort()
      abortRef.current?.abort()
    }
  }, [boardId, mode, enabled, consumeSSE])

  // ── Cancel ────────────────────────────────────────────────

  const cancel = useCallback(() => {
    queueRef.current = []
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancel,
  }
}
