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

interface UseAgentChatOptions {
  boardId: string
  mode: AgentChatMode
  enabled?: boolean
  /** Viewport center for position hints (per-agent only) */
  viewportCenter?: { x: number; y: number }
}

export function useAgentChat({ boardId, mode, enabled = true, viewportCenter }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const greetedRef = useRef(false)
  const loadedRef = useRef(false)
  const messageIdRef = useRef(0)

  const nextId = () => `msg-${++messageIdRef.current}`

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
                  ? { ...m, content: m.content + event.text }
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

  // ── Send message ──────────────────────────────────────────

  const sendMessage = useCallback(async (message: string, displayText?: string) => {
    if (!message.trim() || isLoading) return

    setError(null)
    setIsLoading(true)

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: displayText ?? message,
    }
    const assistantId = nextId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])

    const abort = new AbortController()
    abortRef.current = abort

    const url = mode.type === 'global'
      ? `/api/agent/${boardId}/global`
      : `/api/agent/${boardId}`

    const requestBody = mode.type === 'global'
      ? { message }
      : {
          message,
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

      await consumeSSE(res, assistantId)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const errorMsg = (err as Error).message || 'Failed to send message'
      setError(errorMsg)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }
          : m,
      ))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [boardId, mode, isLoading, consumeSSE, viewportCenter])

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
