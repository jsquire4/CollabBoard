/**
 * POST /api/agent/[boardId]/greet — stream a welcome greeting.
 * Always routes to the gateway container for instant response.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGatewayUrl } from '@/lib/fly-machines'

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? ''

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId)) {
    return new Response(JSON.stringify({ error: 'Invalid board ID' }), { status: 400 })
  }

  // Authenticate user
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Verify board membership (viewers can see greetings too)
  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const body = await request.json()
  const gatewayUrl = getGatewayUrl()

  try {
    const upstream = await fetch(`${gatewayUrl}/greet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Secret': AGENT_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        boardId,
        isNewBoard: body.isNewBoard ?? false,
      }),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      return new Response(JSON.stringify({ error: text }), { status: upstream.status })
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[greet] Failed to proxy greeting:', error)
    return new Response(
      JSON.stringify({ error: 'Agent unavailable' }),
      { status: 503, headers: { 'Retry-After': '5' } },
    )
  }
}
