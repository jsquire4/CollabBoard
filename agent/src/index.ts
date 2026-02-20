/**
 * Agent container — Express server entry point.
 * Endpoints: /health, /heartbeat, /chat, /greet
 */

import express from 'express'
import { PORT, AGENT_INTERNAL_SECRET } from './lib/env.js'
import { initTracing } from './lib/langsmith.js'
import { chatRouter } from './routes/chat.js'
import { greetRouter } from './routes/greet.js'
import { cleanupAllBoards } from './state.js'

// Initialize tracing before anything else
initTracing()

const app = express()
app.use(express.json({ limit: '1mb' }))

// ── Auth middleware ──────────────────────────────────────────

app.use((req, res, next) => {
  // Health check is unauthenticated
  if (req.path === '/health') return next()

  const secret = req.headers['x-agent-secret'] as string
  if (!AGENT_INTERNAL_SECRET) {
    console.error('[agent] AGENT_INTERNAL_SECRET is not set — rejecting all requests')
    res.status(500).json({ error: 'Server misconfigured' })
    return
  }
  if (secret !== AGENT_INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

// ── Health ───────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// ── Heartbeat ───────────────────────────────────────────────

app.post('/heartbeat', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Chat + Greet routes ─────────────────────────────────────

app.use(chatRouter)
app.use(greetRouter)

// ── Start ───────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[agent] Listening on port ${PORT}`)
})

// ── Graceful shutdown ───────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[agent] Received ${signal}, shutting down...`)
  await cleanupAllBoards()
  server.close(() => {
    console.log('[agent] Server closed')
    process.exit(0)
  })
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
