/**
 * Shared DB helpers for agent tool implementations.
 * All helpers operate against the admin client and mutate ToolContext state
 * so subsequent tools in the same request see up-to-date data.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { tickHLC, type HLC } from '@/lib/crdt/hlc'
import { mergeClocks, type FieldClocks } from '@/lib/crdt/merge'
import type { BoardObject } from '@/types/board'
import type { ToolContext } from './types'

// ── Named constants ────────────────────────────────────────────────────────────

/** Maximum file size to read as text (chars). ~200KB */
export const MAX_FILE_CHARS = 200_000

/** Signed URL TTL in seconds for describeImage */
export const SIGNED_URL_TTL = 60

/** Maximum objects returned by getBoardState */
export const BOARD_STATE_OBJECT_LIMIT = 5_000

// ── Clock helpers ──────────────────────────────────────────────────────────────

export function advanceClock(ctx: ToolContext): HLC {
  ctx.hlc = tickHLC(ctx.hlc)
  return ctx.hlc
}

// ── Row builders ───────────────────────────────────────────────────────────────

export function buildInsertRow(
  obj: Record<string, unknown>,
  clocks: FieldClocks,
): Record<string, unknown> {
  const row: Record<string, unknown> = { ...obj, field_clocks: clocks }
  if (typeof row.table_data === 'string') {
    try { row.table_data = JSON.parse(row.table_data) } catch { /* leave as-is */ }
  }
  if (typeof row.rich_text === 'string') {
    try { row.rich_text = JSON.parse(row.rich_text) } catch { /* leave as-is */ }
  }
  return row
}

// ── DB operations ─────────────────────────────────────────────────────────────

export async function insertObject(
  obj: Record<string, unknown>,
  clocks: FieldClocks,
  ctx: ToolContext,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  const row = buildInsertRow(obj, clocks)
  const { error } = await admin.from('board_objects').insert(row)
  if (error) return { success: false, error: error.message }

  // Update local state so subsequent tools in same request see the new object
  ctx.state.objects.set(obj.id as string, obj as unknown as BoardObject)
  ctx.state.fieldClocks.set(obj.id as string, clocks)

  return { success: true }
}

export async function updateFields(
  id: string,
  boardId: string,
  updates: Record<string, unknown>,
  clocks: FieldClocks,
  ctx: ToolContext,
): Promise<{ success: boolean; error?: string }> {
  const existing = ctx.state.objects.get(id)
  if (!existing) return { success: false, error: `Object ${id} not found` }
  if (existing.deleted_at) return { success: false, error: `Object ${id} has been deleted` }

  // Cross-board guard
  if (existing.board_id !== boardId) return { success: false, error: 'Object not found' }

  const existingClocks = ctx.state.fieldClocks.get(id) ?? {}
  const mergedClocks = mergeClocks(existingClocks, clocks)

  const row: Record<string, unknown> = {
    ...updates,
    field_clocks: mergedClocks,
    updated_at: new Date().toISOString(),
  }
  if (typeof row.table_data === 'string') {
    try { row.table_data = JSON.parse(row.table_data as string) } catch { /* leave as-is */ }
  }
  if (typeof row.rich_text === 'string') {
    try { row.rich_text = JSON.parse(row.rich_text as string) } catch { /* leave as-is */ }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('board_objects')
    .update(row)
    .eq('id', id)
    .is('deleted_at', null)
  if (error) return { success: false, error: error.message }

  ctx.state.objects.set(id, { ...existing, ...updates, updated_at: new Date().toISOString() } as BoardObject)
  ctx.state.fieldClocks.set(id, mergedClocks)

  return { success: true }
}
