/**
 * POST /api/agent/[boardId] — proxy chat messages to the agent container.
 * Authenticates user, determines container routing, streams SSE response.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContainerInfo } from '@/lib/agent-registry'
import { getGatewayUrl } from '@/lib/fly-machines'

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? ''
if (!AGENT_INTERNAL_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[api/agent] AGENT_INTERNAL_SECRET is not set — agent requests will fail')
}

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

  // Verify board membership
  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const body = await request.json()

  // Determine container URL: dedicated > gateway
  const container = await getContainerInfo(boardId)
  const containerUrl = container?.machine_url && container.status === 'running'
    ? container.machine_url
    : getGatewayUrl()

  try {
    const upstream = await fetch(`${containerUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Secret': AGENT_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        message: body.message,
        boardId,
        userId: user.id,
      }),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      return new Response(JSON.stringify({ error: text }), { status: upstream.status })
    }

    // Proxy the SSE stream
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[api/agent] Failed to proxy chat:', error)
    return new Response(
      JSON.stringify({ error: 'Agent unavailable' }),
      { status: 503, headers: { 'Retry-After': '5' } },
    )
  }
}
