export const PORT = parseInt(process.env.PORT || '8080', 10)
export const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET || ''
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
export const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || ''
export const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || 'collabboard-agent'

// Startup validation — warn about missing critical env vars
if (!OPENAI_API_KEY) {
  console.error('[agent] OPENAI_API_KEY is not set — all AI requests will fail')
}
if (!AGENT_INTERNAL_SECRET) {
  console.error('[agent] AGENT_INTERNAL_SECRET is not set — all requests will be rejected')
}
