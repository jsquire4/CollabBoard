'use client'

import { useCallback, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
// Must match server allowlist in /api/files/upload/route.ts.
// SVG excluded: browsers execute embedded scripts in SVG served from storage URLs (XSS risk).
const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
])

interface UseFileUploadDeps {
  boardId: string
  canEdit: boolean
  supabase: SupabaseClient
  addObject: (type: 'file', x: number, y: number, overrides?: Partial<BoardObject>) => BoardObject | null
  removeObject?: (objectId: string) => void
}

export function useFileUpload({ boardId, canEdit, supabase, addObject, removeObject }: UseFileUploadDeps) {
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(async (file: File, x?: number, y?: number) => {
    if (!canEdit) {
      toast.error('You do not have permission to upload files')
      return null
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
      return null
    }

    if (!ALLOWED_MIMES.has(file.type)) {
      toast.error(`Unsupported file type: ${file.type}`)
      return null
    }

    setIsUploading(true)
    const objectId = uuidv4()
    // Sanitize filename: strip path separators to prevent traversal
    const safeName = file.name.replace(/[/\\]/g, '_')
    const storagePath = `${boardId}/${objectId}/${safeName}`

    try {
      const { error: uploadError } = await supabase
        .storage
        .from('board-assets')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        return null
      }

      // For images, read native dimensions
      let imgWidth: number | undefined
      let imgHeight: number | undefined
      if (file.type.startsWith('image/')) {
        let blobUrl: string | undefined
        try {
          blobUrl = URL.createObjectURL(file)
          const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = reject
            img.src = blobUrl!
          })
          imgWidth = dims.w
          imgHeight = dims.h
        } catch { /* fall through to defaults */ } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl)
        }
      }

      // Create a file-type board object
      const obj = addObject('file' as 'file', x ?? 0, y ?? 0, {
        id: objectId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        text: file.name,
        ...(imgWidth && imgHeight ? { width: imgWidth, height: imgHeight } : {}),
      })

      toast.success(`File uploaded: ${file.name}`)
      return obj
    } catch (err) {
      toast.error('Upload failed')
      console.error('[useFileUpload] Error:', err)
      return null
    } finally {
      setIsUploading(false)
    }
  }, [boardId, canEdit, supabase, addObject])

  const handleDrop = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await uploadFile(file)
    }
  }, [uploadFile])

  const deleteFile = useCallback(async (objectId: string, storagePath: string) => {
    // Remove from storage
    const { error } = await supabase.storage.from('board-assets').remove([storagePath])
    if (error) {
      toast.error('Failed to delete file')
      console.error('[useFileUpload] Delete error:', error)
      return
    }
    // Remove board object
    if (removeObject) {
      removeObject(objectId)
    }
    toast.success('File deleted')
  }, [supabase, removeObject])

  return {
    isUploading,
    uploadFile,
    handleDrop,
    deleteFile,
  }
}
