'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from './useAgentChat'

export type { ChatMessage }

interface UseGlobalAgentChatOptions {
  boardId: string
  enabled?: boolean
}

export function useGlobalAgentChat({ boardId, enabled = true }: UseGlobalAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadedRef = useRef(false)
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
                m.id === assistantId ? { ...m, isStreaming: false } : m,
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
      if (!receivedDone) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false } : m,
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
      const res = await fetch(`/api/agent/${boardId}/global`, {
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

  // ── Load history on mount ─────────────────────────────────

  useEffect(() => {
    if (!enabled || loadedRef.current) return
    loadedRef.current = true

    const abortController = new AbortController()

    const init = async () => {
      const supabase = createClient()
      // Global messages: agent_object_id IS NULL
      const { data } = await supabase
        .from('board_messages')
        .select('id, role, content, tool_calls, user_display_name, created_at')
        .eq('board_id', boardId)
        .is('agent_object_id', null)
        .order('created_at', { ascending: true })
        .limit(200)

      if (abortController.signal.aborted) return

      if (data && data.length > 0) {
        const loaded: ChatMessage[] = data.map(row => ({
          id: row.id,
          role: row.role as 'user' | 'assistant' | 'system',
          content: row.content,
          user_display_name: row.user_display_name,
          toolCalls: row.tool_calls as ChatMessage['toolCalls'],
        }))
        messageIdRef.current = loaded.length
        setMessages(loaded)
      }
    }

    init()
    return () => { abortController.abort() }
  }, [boardId, enabled])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { messages, isLoading, error, sendMessage, cancel }
}
