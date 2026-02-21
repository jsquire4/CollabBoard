import type { SupabaseClient } from '@supabase/supabase-js'
import type { Board } from '@/types/board'

/** Max objects per Supabase insert call. Supabase imposes a payload size limit
 *  so we chunk large boards to stay well under it. */
const CHUNK_SIZE = 300

/**
 * Duplicate a board (objects, FK remapping, rollback on failure).
 *
 * @param supabase - Client-side Supabase instance (caller must be authenticated)
 * @param boardId  - The board to copy
 * @param boardName - Display name of the source board (used to build the copy name)
 * @param existingNames - Current board names to avoid collisions (pass [...myBoards, ...sharedBoards].map(b => b.name))
 * @param userId   - The authenticated user's ID
 * @returns The new board record on success (all columns from the insert), or `null` on failure
 */
export async function duplicateBoard(
  supabase: SupabaseClient,
  boardId: string,
  boardName: string,
  existingNames: string[],
  userId: string,
): Promise<Board | null> {
  // Deduplicate name
  let copyName = `${boardName} - Copy`
  let counter = 2
  while (existingNames.includes(copyName)) {
    copyName = `${boardName} - Copy (${counter})`
    counter++
  }

  // Create the new board shell
  const { data: newBoard, error: boardError } = await supabase
    .from('boards')
    .insert({ name: copyName, created_by: userId })
    .select()
    .single()

  if (boardError || !newBoard) return null

  // Fetch source objects
  const { data: sourceObjects } = await supabase
    .from('board_objects')
    .select('*')
    .eq('board_id', boardId)
    .is('deleted_at', null)

  if (sourceObjects && sourceObjects.length > 0) {
    // Build old-id → new-id map so FK references stay consistent
    const idMap = new Map<string, string>()
    for (const obj of sourceObjects) {
      idMap.set(obj.id, crypto.randomUUID())
    }
    const remap = (oldId: string | null | undefined) =>
      oldId ? (idMap.get(oldId) ?? null) : null

    const copies = sourceObjects.map(({ id, created_at, updated_at, board_id, ...rest }) => ({
      ...rest,
      id: idMap.get(id),
      board_id: newBoard.id,
      created_by: userId,
      parent_id: remap(rest.parent_id),
      connect_start_id: remap(rest.connect_start_id),
      connect_end_id: remap(rest.connect_end_id),
    }))

    // Insert in chunks to stay under Supabase payload limits
    for (let i = 0; i < copies.length; i += CHUNK_SIZE) {
      const { error: chunkError } = await supabase
        .from('board_objects')
        .insert(copies.slice(i, i + CHUNK_SIZE))

      if (chunkError) {
        // Rollback: delete all objects already inserted, then delete the board shell
        try {
          await supabase.from('board_objects').delete().eq('board_id', newBoard.id)
          await supabase.from('boards').delete().eq('id', newBoard.id)
        } catch {
          // Cleanup failed — orphaned board may remain
        }
        return null
      }
    }
  }

  return newBoard as Board
}
