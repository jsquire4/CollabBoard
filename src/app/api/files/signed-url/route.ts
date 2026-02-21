/**
 * GET /api/files/signed-url?path=boardId/objectId/file.ext
 * Returns a short-lived signed URL for accessing a file from board-assets storage.
 * Requires authentication and board membership.
 */

import { normalize } from 'node:path/posix'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE } from '@/lib/api/uuidRe'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawPath = request.nextUrl.searchParams.get('path')
  if (!rawPath) {
    return Response.json({ error: 'path query parameter is required' }, { status: 400 })
  }

  // Path validation — normalize to catch traversal attempts (e.g. "a/../b", encoded dots)
  const safePath = normalize(rawPath)
  if (safePath !== rawPath || safePath.startsWith('/') || safePath.startsWith('.')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Extract boardId from storage path.
  // API uploads use "files/{boardId}/{fileId}.{ext}"; legacy canvas-drop uses "{boardId}/...".
  const segments = safePath.split('/')
  const boardId = segments[0] === 'files' ? segments[1] : segments[0]
  if (!boardId || !UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Verify the normalized path contains the validated boardId
  if (!safePath.includes(boardId)) {
    return Response.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Check board membership — must be at least a viewer
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
  const { data, error } = await admin
    .storage
    .from('board-assets')
    .createSignedUrl(safePath, 3600) // 1 hour TTL

  if (error || !data?.signedUrl) {
    console.error('[api/files/signed-url] Error:', error)
    return Response.json({ error: 'Failed to create signed URL' }, { status: 500 })
  }

  return Response.json({ signedUrl: data.signedUrl })
}
