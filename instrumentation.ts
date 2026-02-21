/**
 * Next.js instrumentation hook — runs once on server startup (Node.js runtime only).
 * Initializes LangSmith tracing when LANGSMITH_API_KEY is set.
 */

export async function register() {
  if (typeof globalThis.window !== 'undefined') return // client-side — skip

  if (process.env.LANGSMITH_API_KEY) {
    const { Client } = await import('langsmith')
    const client = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
    })
    // Verify connectivity (non-blocking)
    client.readProject({ projectName: process.env.LANGSMITH_PROJECT ?? 'collabboard-agent-mechanics' })
      .then(() => console.log('[LangSmith] Tracing enabled'))
      .catch(() => console.warn('[LangSmith] Could not connect — tracing may not work'))
  }
}
