/**
 * GET /api/files/[boardId] — list files for a board.
 * Any board member can view the file library.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { UUID_RE } from '@/lib/api/uuidRe'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params

  if (!UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid board ID' }, { status: 400 })
  }

  // Auth
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Any board member can list files
  const member = await requireBoardMember(supabase, boardId, user.id)
  if (!member) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('[api/files] Admin client unavailable:', err)
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }
  const { data: files, error } = await admin
    .from('files')
    .select('id, name, file_type, size, storage_path, created_at')
    .eq('owner_type', 'board')
    .eq('owner_id', boardId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[api/files] Error fetching files:', error)
    return Response.json({ error: 'Failed to load files' }, { status: 500 })
  }

  return Response.json({ files: files ?? [] })
}
