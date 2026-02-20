'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: { toolName: string; args: unknown }[]
  toolResults?: { toolName: string; result: unknown }[]
  isStreaming?: boolean
}

interface UseAgentChatOptions {
  boardId: string
  enabled?: boolean
}

export function useAgentChat({ boardId, enabled = true }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const greetedRef = useRef(false)
  const messageIdRef = useRef(0)

  const nextId = () => `msg-${++messageIdRef.current}`

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
      // Ensure isStreaming is cleared even if stream ends without a 'done' event
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

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return

    setError(null)
    setIsLoading(true)

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: message,
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

    try {
      const res = await fetch(`/api/agent/${boardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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
  }, [boardId, isLoading, consumeSSE])

  // ── Greeting on mount ─────────────────────────────────────

  useEffect(() => {
    if (!enabled || greetedRef.current) return
    greetedRef.current = true

    const abortController = new AbortController()

    const greet = async () => {
      const assistantId = nextId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }
      setMessages([assistantMsg])

      try {
        // Fire start in parallel to pre-warm dedicated container
        fetch(`/api/agent/${boardId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: abortController.signal,
        }).catch(() => {}) // Fire-and-forget

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

    greet()

    return () => { abortController.abort() }
  }, [boardId, enabled, consumeSSE])

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
