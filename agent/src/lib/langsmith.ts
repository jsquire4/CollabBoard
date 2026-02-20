/**
 * LangSmith tracing setup.
 * When LANGSMITH_API_KEY is set, enables automatic trace collection
 * for streamText calls via the AI SDK's telemetry integration.
 */

import { LANGSMITH_API_KEY, LANGSMITH_PROJECT } from './env.js'

export const TRACING_ENABLED = !!LANGSMITH_API_KEY

export function initTracing() {
  if (!TRACING_ENABLED) {
    console.log('[langsmith] No API key — tracing disabled')
    return
  }

  // LangSmith auto-instruments via env vars
  process.env.LANGCHAIN_TRACING_V2 = 'true'
  process.env.LANGCHAIN_API_KEY = LANGSMITH_API_KEY
  process.env.LANGCHAIN_PROJECT = LANGSMITH_PROJECT

  console.log(`[langsmith] Tracing enabled — project: ${LANGSMITH_PROJECT}`)
}

export interface TraceMetadata {
  boardId: string
  userId?: string
  stepNumber?: number
  toolName?: string
  tokenUsage?: { promptTokens: number; completionTokens: number }
  latencyMs?: number
}

export function logTrace(metadata: TraceMetadata) {
  if (!TRACING_ENABLED) return
  // Structured log for LangSmith ingestion via stdout
  console.log(JSON.stringify({ _langsmith: true, ...metadata }))
}
