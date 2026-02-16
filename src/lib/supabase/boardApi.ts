import { SupabaseClient } from '@supabase/supabase-js'
import { BoardObject } from '@/types/board'

export async function fetchBoardObjects(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardObject[]> {
  const { data, error } = await supabase
    .from('board_objects')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch board objects: ${error.message}`)
  }

  return data as BoardObject[]
}

export async function insertBoardObject(
  supabase: SupabaseClient,
  object: Omit<BoardObject, 'created_at' | 'updated_at'>
): Promise<BoardObject> {
  const { data, error } = await supabase
    .from('board_objects')
    .insert(object)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to insert board object: ${error.message}`)
  }

  return data as BoardObject
}

export async function updateBoardObject(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<BoardObject>
): Promise<void> {
  const { error } = await supabase
    .from('board_objects')
    .update(updates)
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to update board object: ${error.message}`)
  }
}

export async function deleteBoardObject(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('board_objects')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete board object: ${error.message}`)
  }
}
