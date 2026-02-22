/**
 * GET /api/agent/[boardId]/global/history — global agent conversation history.
 *
 * The global agent is now stateless (Chat Completions, no thread).
 * History is not persisted — returns an empty array.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { UUID_RE } from '@/lib/api/uuidRe'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params

  if (!UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid board ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await requireBoardMember(supabase, boardId, user.id, {
    allowedRoles: ['owner', 'manager', 'editor'],
    requireAgents: true,
  })
  if (!member) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  return Response.json([])
}
