/**
 * SSE test helpers — matches the consumeSSE format in useAgentChat.ts
 */

export function makeFakeSSE(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

export async function collectSSE(response: Response): Promise<unknown[]> {
  const reader = response.body?.getReader()
  if (!reader) return []
  const decoder = new TextDecoder()
  const events: unknown[] = []
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() ?? ''
    for (const chunk of lines) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)))
          } catch { /* skip malformed */ }
        }
      }
    }
  }

  return events
}
