/**
 * Shared DB helpers for agent tool implementations.
 * All helpers operate against the admin client and mutate ToolContext state
 * so subsequent tools in the same request see up-to-date data.
 */

import { v4 as uuidv4 } from 'uuid'
import { createAdminClient } from '@/lib/supabase/admin'
import { tickHLC, type HLC } from '@/lib/crdt/hlc'
import { mergeClocks, stampFields, type FieldClocks } from '@/lib/crdt/merge'
import type { ZodType } from 'zod'
import type { BoardObject } from '@/types/board'
import type { ToolContext, ToolDef } from './types'

// ── Named constants ────────────────────────────────────────────────────────────

/** Maximum file size to read as text (chars). ~200KB */
export const MAX_FILE_CHARS = 200_000

/** Signed URL TTL in seconds for describeImage */
export const SIGNED_URL_TTL = 60

/** Maximum objects returned by getBoardState */
export const BOARD_STATE_OBJECT_LIMIT = 5_000

/** Minimum canvas margin for auto-placed objects (px) */
export const SCATTER_MARGIN = 100

/** Horizontal scatter range for small objects (sticky notes, shapes) */
export const SCATTER_X_WIDE = 700

/** Horizontal scatter range for large objects (frames, tables) */
export const SCATTER_X_NARROW = 500

/** Vertical scatter range for small objects */
export const SCATTER_Y_WIDE = 500

/** Vertical scatter range for large objects */
export const SCATTER_Y_NARROW = 400

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

// ── Object factory helper ──────────────────────────────────────────────────────

/**
 * Build, stamp with HLC, and insert a new board object in one step.
 * Callers pass all fields including z_index, rotation, parent_id, etc.
 * The id, board_id, and created_by are injected automatically.
 */
export async function buildAndInsertObject(
  ctx: ToolContext,
  type: string,
  fields: Record<string, unknown>,
): Promise<{ success: true; id: string; obj: Record<string, unknown> } | { success: false; error: string }> {
  const clock = advanceClock(ctx)
  const id = uuidv4()
  const obj: Record<string, unknown> = {
    id,
    board_id: ctx.boardId,
    type,
    created_by: ctx.userId,
    ...fields,
  }
  const allFields = Object.keys(obj).filter(k => k !== 'id' && k !== 'board_id' && k !== 'created_by')
  const clocks = stampFields(allFields, clock)
  const result = await insertObject(obj, clocks, ctx)
  if (!result.success) return { success: false, error: result.error ?? 'Insert failed' }
  return { success: true, id, obj }
}

// ── Tool definition factory ────────────────────────────────────────────────────

/**
 * Wraps a typed execute function with Zod validation and error handling,
 * producing a ToolDef consumable by the thin index.ts orchestrator.
 */
export function makeToolDef<T>(
  name: string,
  description: string,
  schema: ZodType<T>,
  execute: (ctx: ToolContext, args: T) => Promise<unknown>,
): ToolDef {
  return {
    name,
    description,
    executor: async (ctx: ToolContext, rawArgs: unknown) => {
      const parsed = schema.safeParse(rawArgs)
      if (!parsed.success) return { error: `Invalid arguments: ${parsed.error.message}` }
      try {
        return await execute(ctx, parsed.data)
      } catch (err) {
        return { error: (err as Error).message }
      }
    },
  }
}
