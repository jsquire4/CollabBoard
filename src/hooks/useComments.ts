'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Comment {
  id: string
  board_id: string
  object_id: string
  user_id: string
  user_display_name: string | null
  content: string
  resolved_at: string | null
  parent_id: string | null
  created_at: string
}

interface UseCommentsOptions {
  boardId: string
  objectId: string | null
  enabled?: boolean
}

export function useComments({ boardId, objectId, enabled = true }: UseCommentsOptions) {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // ── Load comments ──────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !objectId) return
    loadedRef.current = false

    const abortController = new AbortController()
    setIsLoading(true)
    setError(null)

    const init = async () => {
      const supabase = createClient()

      const { data, error: fetchError } = await supabase
        .from('comments')
        .select('id, board_id, object_id, user_id, user_display_name, content, resolved_at, parent_id, created_at')
        .eq('board_id', boardId)
        .eq('object_id', objectId)
        .order('created_at', { ascending: true })

      if (abortController.signal.aborted) return

      if (fetchError) {
        setError(fetchError.message)
        setIsLoading(false)
        return
      }

      setComments((data as Comment[]) ?? [])
      setIsLoading(false)
      loadedRef.current = true

      // ── Subscribe to Realtime changes ─────────────────────
      const channel = supabase
        .channel(`comments:${boardId}:${objectId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'comments',
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const newComment = payload.new as Comment
            if (newComment.object_id !== objectId) return
            setComments(prev => {
              // Avoid duplicate if optimistic insert already added this ID
              if (prev.some(c => c.id === newComment.id)) return prev
              return [...prev, newComment]
            })
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'comments',
            filter: `board_id=eq.${boardId}`,
          },
          (payload) => {
            const updated = payload.new as Comment
            if (updated.object_id !== objectId) return
            setComments(prev => prev.map(c => c.id === updated.id ? updated : c))
          },
        )
        .subscribe()

      channelRef.current = channel
    }

    init()

    return () => {
      abortController.abort()
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      loadedRef.current = false
    }
  }, [boardId, objectId, enabled])

  // ── Add comment ───────────────────────────────────────────

  const addComment = useCallback(async (content: string, parentId?: string | null) => {
    if (!objectId || !content.trim()) return

    const supabase = createClient()

    // Optimistic insert
    const tempId = `temp-${Date.now()}`
    const optimistic: Comment = {
      id: tempId,
      board_id: boardId,
      object_id: objectId,
      user_id: 'pending',
      user_display_name: null,
      content,
      resolved_at: null,
      parent_id: parentId ?? null,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])

    const { data, error: insertError } = await supabase
      .from('comments')
      .insert({
        board_id: boardId,
        object_id: objectId,
        content,
        parent_id: parentId ?? null,
      })
      .select('id, board_id, object_id, user_id, user_display_name, content, resolved_at, parent_id, created_at')
      .single()

    if (insertError) {
      // Remove optimistic entry on failure
      setComments(prev => prev.filter(c => c.id !== tempId))
      setError(insertError.message)
      return
    }

    // Replace optimistic with real data
    setComments(prev => prev.map(c => c.id === tempId ? (data as Comment) : c))
  }, [boardId, objectId])

  // ── Resolve comment ───────────────────────────────────────

  const resolveComment = useCallback(async (id: string) => {
    const supabase = createClient()
    const now = new Date().toISOString()

    // Capture original resolved_at for revert, then apply optimistic update
    let originalResolvedAt: string | null = null
    setComments(prev => {
      const comment = prev.find(c => c.id === id)
      originalResolvedAt = comment?.resolved_at ?? null
      return prev.map(c => c.id === id ? { ...c, resolved_at: now } : c)
    })

    const { error: updateError } = await supabase
      .from('comments')
      .update({ resolved_at: now })
      .eq('id', id)

    if (updateError) {
      // Revert to original value (not null — comment may have already been resolved)
      setComments(prev => prev.map(c => c.id === id ? { ...c, resolved_at: originalResolvedAt } : c))
      setError(updateError.message)
    }
  }, [])

  // ── Delete comment ────────────────────────────────────────

  const deleteComment = useCallback(async (id: string) => {
    const supabase = createClient()

    // Optimistic remove
    setComments(prev => prev.filter(c => c.id !== id))

    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Can't easily revert without fetching — just set error
      setError(deleteError.message)
    }
  }, [])

  return {
    comments,
    isLoading,
    error,
    addComment,
    resolveComment,
    deleteComment,
  }
}
