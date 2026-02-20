/**
 * POST /chat — main agent chat endpoint with SSE streaming.
 */

import { Router } from 'express'
import { createAgentStream } from '../agent.js'
import { loadBoardState } from '../state.js'
import { supabase } from '../lib/supabase.js'
import type { BoardMessage } from '../types.js'

const router = Router()

router.post('/chat', async (req, res) => {
  const { message, boardId, userId } = req.body

  if (!message || !boardId || !userId) {
    res.status(400).json({ error: 'Missing message, boardId, or userId' })
    return
  }

  try {
    // Ensure board state is loaded
    const state = await loadBoardState(boardId)

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Detect client disconnect
    let clientDisconnected = false
    res.on('close', () => { clientDisconnected = true })

    const result = createAgentStream({
      message,
      history: state.messages,
      boardId,
      userId,
    })

    let fullText = ''
    let toolCalls: unknown[] = []

    for await (const part of result.fullStream) {
      if (clientDisconnected) break
      if (part.type === 'text-delta') {
        fullText += part.text
        res.write(`data: ${JSON.stringify({ type: 'text-delta', text: part.text })}\n\n`)
      } else if (part.type === 'tool-call') {
        toolCalls.push({
          toolName: part.toolName,
          args: part.input,
        })
        res.write(`data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, args: part.input })}\n\n`)
      } else if (part.type === 'tool-result') {
        res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, result: part.output })}\n\n`)
      } else if (part.type === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', error: String(part.error) })}\n\n`)
      }
    }

    // Stream complete
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()

    // Save messages to DB (fire-and-forget)
    const userMsg: Partial<BoardMessage> = {
      board_id: boardId,
      role: 'user',
      user_id: userId,
      content: message,
    }
    const assistantMsg: Partial<BoardMessage> = {
      board_id: boardId,
      role: 'assistant',
      content: fullText,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    }

    supabase.from('board_messages').insert([userMsg, assistantMsg]).then(({ error }) => {
      if (error) console.error('[chat] Failed to save messages:', error.message)
    })

    // Update local message cache (cap at 200 to prevent unbounded growth)
    const MAX_CACHED_MESSAGES = 200
    const now = new Date().toISOString()
    state.messages.push(
      { ...userMsg, id: '', created_at: now } as BoardMessage,
      { ...assistantMsg, id: '', created_at: now } as BoardMessage,
    )
    if (state.messages.length > MAX_CACHED_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_CACHED_MESSAGES)
    }
  } catch (error) {
    console.error('[chat] Stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`)
      res.end()
    }
  }
})

export { router as chatRouter }
