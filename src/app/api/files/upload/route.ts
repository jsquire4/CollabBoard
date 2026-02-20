/**
 * POST /api/files/upload — upload a file to board-assets storage.
 * Requires editor role. Max 50MB. MIME allowlist enforced before storage.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { v4 as uuidv4 } from 'uuid'

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

// SVG excluded: browsers execute embedded scripts in SVG served from storage URLs (XSS risk).
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/csv': 'csv',
  }
  return map[mime] ?? 'bin'
}

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const boardId = formData.get('boardId') as string | null

  if (!file) return Response.json({ error: 'file is required' }, { status: 400 })
  if (!boardId) return Response.json({ error: 'boardId is required' }, { status: 400 })
  if (!UUID_RE.test(boardId)) return Response.json({ error: 'Invalid board ID' }, { status: 400 })

  // Validate MIME type before anything else
  if (!ALLOWED_MIMES.has(file.type)) {
    return Response.json({
      error: `File type not allowed: ${file.type}. Allowed: images, PDF, text, markdown, CSV`,
    }, { status: 400 })
  }

  // Validate size
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 })
  }

  // Check board membership (editor or owner)
  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const fileId = uuidv4()
  const ext = extFromMime(file.type)
  const storagePath = `files/${boardId}/${fileId}.${ext}`

  // Upload to Supabase Storage
  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin
    .storage
    .from('board-assets')
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[api/files/upload] Storage error:', uploadError)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }

  // Insert files table record
  const { data: fileRecord, error: dbError } = await admin
    .from('files')
    .insert({
      id: fileId,
      name: file.name,
      file_type: file.type,
      size: file.size,
      storage_path: storagePath,
      owner_type: 'board',
      owner_id: boardId,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (dbError) {
    console.error('[api/files/upload] DB error:', dbError)
    // Clean up orphaned storage file
    await admin.storage.from('board-assets').remove([storagePath])
    return Response.json({ error: 'Failed to save file record' }, { status: 500 })
  }

  return Response.json({ file: fileRecord }, { status: 201 })
}
