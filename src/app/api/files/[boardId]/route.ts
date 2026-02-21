/**
 * GET /api/files/[boardId] — list files for a board.
 * Any board member can view the file library.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
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
