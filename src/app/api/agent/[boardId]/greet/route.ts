/**
 * POST /api/agent/[boardId]/greet — direct OpenAI streaming greeting.
 * Uses gpt-4o-mini for fast, lightweight responses. Viewers can receive greetings.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UUID_RE } from '@/lib/api/uuidRe'
import { getOpenAI } from '@/lib/agent/sse'

export const maxDuration = 30

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params

  if (!UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid board ID' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  const openai = getOpenAI()

  // Auth — viewers can see greetings
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { isNewBoard?: boolean } = {}
  try {
    body = await request.json()
  } catch { /* ignore */ }

  const isNew = body.isNewBoard ?? false
  const prompt = isNew
    ? 'You are a helpful board agent. Greet the user warmly and let them know you can help them create and organize content on their new blank board. Be brief (2-3 sentences).'
    : 'You are a helpful board agent. Greet the user warmly and let them know you can help them work with their board. Be brief (1-2 sentences).'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        })

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content
          if (text) enqueue({ type: 'text-delta', text })
        }

        enqueue({ type: 'done' })
      } catch (err) {
        console.error('[api/agent/greet] Error:', err)
        enqueue({ type: 'error', error: 'Failed to generate greeting' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
