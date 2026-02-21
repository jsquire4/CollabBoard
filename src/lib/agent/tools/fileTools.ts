/**
 * Tool executors for reading board-linked files from storage.
 */

import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { makeToolDef, MAX_FILE_CHARS, SIGNED_URL_TTL, getConnectedObjectIds } from './helpers'
import { describeImageSchema, readFileContentSchema } from './schemas'
import type { ToolDef } from './types'

export const fileTools: ToolDef[] = [

  makeToolDef(
    'describeImage',
    'Describe an image that has been uploaded to the board. Pass the object ID of a file-type board object with an image MIME type.',
    describeImageSchema,
    async (ctx, { objectId }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }
      const obj = ctx.state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }
      if (!obj.mime_type?.startsWith('image/')) {
        return { error: `Object is not an image (mime: ${obj.mime_type})` }
      }
      // Guard: normalize the path first to collapse any traversal segments (e.g. /../),
      // then verify it is scoped to this board's directory.
      if (!path.posix.normalize(obj.storage_path).startsWith(`files/${ctx.boardId}/`)) {
        return { error: 'File access denied' }
      }

      const admin = createAdminClient()
      const { data: signedUrl, error: urlError } = await admin
        .storage
        .from('board-assets')
        .createSignedUrl(obj.storage_path, SIGNED_URL_TTL)

      if (urlError || !signedUrl) {
        return { error: `Failed to create signed URL: ${urlError?.message}` }
      }

      return {
        imageUrl: signedUrl.signedUrl,
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        instruction: `Use this signed URL to view and describe the image. The URL is temporary (${SIGNED_URL_TTL}s).`,
      }
    },
  ),

  makeToolDef(
    'readFileContent',
    'Read the text content of an uploaded file (text, markdown, CSV, or PDF). Returns the file content as text.',
    readFileContentSchema,
    async (ctx, { objectId }) => {
      if (ctx.agentObjectId && !getConnectedObjectIds(ctx.state, ctx.agentObjectId).has(objectId)) {
        return { error: 'Object not connected to this agent' }
      }
      const obj = ctx.state.objects.get(objectId)
      if (!obj) return { error: `Object ${objectId} not found` }
      if (!obj.storage_path) return { error: 'Object has no file attached' }
      // Guard: normalize the path first to collapse any traversal segments (e.g. /../),
      // then verify it is scoped to this board's directory.
      if (!path.posix.normalize(obj.storage_path).startsWith(`files/${ctx.boardId}/`)) {
        return { error: 'File access denied' }
      }

      const allowedMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/pdf']
      if (!obj.mime_type || !allowedMimes.includes(obj.mime_type)) {
        return { error: `Unsupported file type for reading: ${obj.mime_type}` }
      }

      const admin = createAdminClient()
      const { data, error } = await admin
        .storage
        .from('board-assets')
        .download(obj.storage_path)

      if (error || !data) {
        return { error: `Failed to download file: ${error?.message}` }
      }

      const text = await data.text()
      const truncated = text.length > MAX_FILE_CHARS
        ? text.slice(0, MAX_FILE_CHARS) + '\n\n[Content truncated...]'
        : text

      return {
        fileName: obj.file_name,
        mimeType: obj.mime_type,
        content: truncated,
        truncated: text.length > MAX_FILE_CHARS,
      }
    },
  ),
]
