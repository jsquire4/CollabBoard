/**
 * POST /greet — lightweight greeting endpoint with SSE streaming.
 * No tools, no board state needed — fast response for pre-warming.
 */

import { Router } from 'express'
import { createGreetingStream } from '../agent.js'
import { supabase } from '../lib/supabase.js'
import type { BoardMessage } from '../types.js'

const router = Router()

router.post('/greet', async (req, res) => {
  const { boardId, isNewBoard } = req.body

  if (!boardId) {
    res.status(400).json({ error: 'Missing boardId' })
    return
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let clientDisconnected = false
    res.on('close', () => { clientDisconnected = true })

    const result = createGreetingStream(isNewBoard ?? true)

    let fullText = ''

    for await (const part of result.fullStream) {
      if (clientDisconnected) break
      if (part.type === 'text-delta') {
        fullText += part.text
        res.write(`data: ${JSON.stringify({ type: 'text-delta', text: part.text })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()

    // Save greeting to DB
    const greetingMsg: Partial<BoardMessage> = {
      board_id: boardId,
      role: 'assistant',
      content: fullText,
    }
    supabase.from('board_messages').insert(greetingMsg).then(({ error }) => {
      if (error) console.error('[greet] Failed to save greeting:', error.message)
    })
  } catch (error) {
    console.error('[greet] Stream error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Greeting failed' })}\n\n`)
      res.end()
    }
  }
})

export { router as greetRouter }
