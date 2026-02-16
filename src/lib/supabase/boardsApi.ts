import { createClient } from './server'
import { Board } from '@/types/board'

export async function fetchBoards(): Promise<Board[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch boards:', error.message)
    return []
  }
  return data ?? []
}

export async function createBoard(name: string): Promise<Board> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('boards')
    .insert({ name, created_by: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBoard(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('boards')
    .delete()
    .eq('id', id)

  if (error) throw error
}
