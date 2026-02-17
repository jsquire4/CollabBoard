/**
 * Supabase Edge Function: merge-board-state
 *
 * Called on client reconnect to reconcile local state against the DB.
 * Uses the same per-field LWW merge logic as the client — ensures DB
 * converges to the same state as in-memory clients.
 *
 * Request body: { boardId: string, changes: CrdtChange[] }
 * Response: { merged: number } (count of objects updated)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Inline HLC + merge logic (copied from src/lib/crdt/) ────────────
// These are inlined to avoid import path issues in Deno Edge Functions.
// Keep in sync with src/lib/crdt/hlc.ts and src/lib/crdt/merge.ts.

interface HLC {
  ts: number
  c: number
  n: string
}

type FieldClocks = Record<string, HLC>

function hlcGreaterThan(a: HLC, b: HLC): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts
  if (a.c !== b.c) return a.c > b.c
  return a.n > b.n
}

function mergeFieldClocks(
  localClocks: FieldClocks,
  remoteClocks: FieldClocks,
): FieldClocks {
  const result = { ...localClocks }
  for (const [field, remoteClock] of Object.entries(remoteClocks)) {
    const localClock = result[field]
    if (!localClock || hlcGreaterThan(remoteClock, localClock)) {
      result[field] = remoteClock
    }
  }
  return result
}

// ─── Types ─────────────────────────────────────────────────

interface CrdtChange {
  action: 'create' | 'update' | 'delete'
  objectId: string
  fields: Record<string, unknown>
  clocks: FieldClocks
}

// ─── Handler ───────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // ─── Auth: verify JWT and check board access ──────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create a user-scoped client to verify JWT and check access
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { boardId, changes } = (await req.json()) as {
      boardId: string
      changes: CrdtChange[]
    }

    if (!boardId || !Array.isArray(changes) || changes.length === 0) {
      return new Response(JSON.stringify({ merged: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Verify the user has access to this board (RLS on boards table enforces ownership)
    const { data: board, error: boardError } = await userClient
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .maybeSingle()
    if (boardError || !board) {
      return new Response(JSON.stringify({ error: 'Board not found or access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Proceed with service role client (bypasses RLS for merge operations)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch affected objects from DB
    const objectIds = [...new Set(changes.map(c => c.objectId))]
    const { data: dbObjects, error: fetchError } = await serviceClient
      .from('board_objects')
      .select('id, field_clocks, deleted_at')
      .eq('board_id', boardId)
      .in('id', objectIds)

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const dbClocksMap = new Map<string, FieldClocks>()
    const dbDeletedMap = new Map<string, string | null>()
    for (const row of dbObjects ?? []) {
      dbClocksMap.set(row.id, (row.field_clocks ?? {}) as FieldClocks)
      dbDeletedMap.set(row.id, row.deleted_at)
    }

    // Process each change: merge client's clocks against DB clocks
    const updates: { id: string; fields: Record<string, unknown>; clocks: FieldClocks }[] = []

    for (const change of changes) {
      const dbClocks = dbClocksMap.get(change.objectId) ?? {}

      if (change.action === 'delete') {
        // Client wants to delete. Check if delete clock >= all DB field clocks.
        const deleteClock = change.clocks._deleted
        if (!deleteClock) continue

        let deleteWins = true
        for (const fieldClock of Object.values(dbClocks)) {
          if (hlcGreaterThan(fieldClock, deleteClock)) {
            deleteWins = false
            break
          }
        }

        if (deleteWins && !dbDeletedMap.get(change.objectId)) {
          // Apply tombstone
          await serviceClient
            .from('board_objects')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', change.objectId)
        }
        continue
      }

      // For create/update: merge field-by-field
      const winningFields: Record<string, unknown> = {}
      const winningClocks: FieldClocks = {}
      let hasWins = false

      for (const [field, remoteClock] of Object.entries(change.clocks)) {
        const dbClock = dbClocks[field]
        if (!dbClock || hlcGreaterThan(remoteClock, dbClock)) {
          if (field in change.fields) {
            winningFields[field] = change.fields[field]
            winningClocks[field] = remoteClock
            hasWins = true
          }
        }
      }

      if (hasWins) {
        updates.push({
          id: change.objectId,
          fields: winningFields,
          clocks: mergeFieldClocks(dbClocks, winningClocks),
        })
      }
    }

    // Apply winning updates
    let mergedCount = 0
    for (const update of updates) {
      const { error: updateError } = await serviceClient
        .from('board_objects')
        .update({
          ...update.fields,
          field_clocks: update.clocks,
          deleted_at: null, // Clear tombstone — add-wins
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)

      if (!updateError) mergedCount++
    }

    return new Response(JSON.stringify({ merged: mergedCount }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
