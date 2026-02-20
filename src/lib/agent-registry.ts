/**
 * Board container registry — helpers for the board_containers table.
 * Used by API routes to manage container lifecycle.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ContainerInfo {
  board_id: string
  machine_id: string | null
  machine_url: string | null
  status: 'starting' | 'running' | 'stopping' | 'stopped'
  is_new: boolean
}

export async function ensureBoardContainer(boardId: string): Promise<ContainerInfo> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('ensure_board_container', {
    p_board_id: boardId,
  })

  if (error) throw new Error(`ensure_board_container failed: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No container record returned')

  return data[0] as ContainerInfo
}

export async function getContainerInfo(boardId: string): Promise<ContainerInfo | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('board_containers')
    .select('board_id, machine_id, machine_url, status')
    .eq('board_id', boardId)
    .in('status', ['starting', 'running'])
    .single()

  if (error || !data) return null
  return { ...data, is_new: false } as ContainerInfo
}

export async function updateContainerStatus(
  boardId: string,
  status: 'starting' | 'running' | 'stopping' | 'stopped',
  machineUrl?: string,
  machineId?: string,
) {
  const supabase = createAdminClient()
  const updates: Record<string, unknown> = { status, last_heartbeat: new Date().toISOString() }
  if (machineUrl) updates.machine_url = machineUrl
  if (machineId) updates.machine_id = machineId
  if (status === 'stopped') updates.stopped_at = new Date().toISOString()

  const { error } = await supabase.from('board_containers').update(updates).eq('board_id', boardId)
  if (error) {
    console.error(`[agent-registry] Failed to update container status for ${boardId}:`, error.message)
  }
}

export async function updateHeartbeat(boardId: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('board_containers')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('board_id', boardId)
  if (error) {
    console.error(`[agent-registry] Failed to update heartbeat for ${boardId}:`, error.message)
  }
}
