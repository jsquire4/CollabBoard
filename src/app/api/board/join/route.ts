/**
 * POST /api/board/join — join a board via share link.
 * Reads client IP server-side for block-on-remove; checks board_blocked_ips before join.
 * Caller must be authenticated (e.g. anonymous or Google).
 */

import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getClientIp(request: NextRequest): string | null {
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-vercel-forwarded-for')
  return ip || null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = body.token?.trim()
  if (!token) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }

  const clientIp = getClientIp(request)

  if (clientIp) {
    const { data: boardId, error: boardError } = await supabase.rpc('get_board_id_for_share_token', {
      p_token: token,
    })

    if (boardError || !boardId) {
      return Response.json({ error: 'Invalid or expired share link' }, { status: 404 })
    }

    const { data: isBlocked, error: blockError } = await supabase.rpc('is_ip_blocked_for_board', {
      p_board_id: boardId,
      p_ip: clientIp,
    })

    if (blockError) {
      console.error('[api/board/join] IP block check failed:', blockError)
      return Response.json({ error: 'Failed to verify access' }, { status: 500 })
    }

    if (isBlocked) {
      return Response.json({ error: 'You have been removed from this board' }, { status: 403 })
    }
  }

  const { data: joinedBoardId, error: joinError } = await supabase.rpc('join_board_via_link', {
    p_token: token,
    p_client_ip: clientIp,
  })

  if (joinError) {
    const msg = joinError.message
    if (msg.includes('removed from this board')) {
      return Response.json({ error: msg }, { status: 403 })
    }
    if (msg.includes('Invalid or expired')) {
      return Response.json({ error: msg }, { status: 404 })
    }
    console.error('[api/board/join] Join failed:', joinError)
    return Response.json({ error: 'Failed to join board' }, { status: 500 })
  }

  if (!joinedBoardId) {
    return Response.json({ error: 'Failed to join board' }, { status: 500 })
  }

  return Response.json({ boardId: joinedBoardId }, { status: 200 })
}
