/**
 * Per-field LWW (Last-Writer-Wins) merge logic for CRDT conflict resolution.
 *
 * Each field on an object carries its own HLC clock. When merging a remote
 * update, each field is resolved independently: the higher clock wins.
 * This means concurrent edits to different fields (e.g., drag vs recolor)
 * both survive automatically.
 *
 * Pure TypeScript — no framework imports. Safe for Deno Edge Functions.
 */

import { HLC, hlcGreaterThan } from './hlc'

/** Per-field clock: maps field name → HLC of last write. */
export type FieldClocks = Record<string, HLC>

/**
 * Merge a remote partial update into a local object using per-field LWW.
 *
 * For each field in the remote update:
 * - If remote clock > local clock (or no local clock exists): remote wins
 * - Otherwise: local wins, remote field is discarded
 *
 * Returns the merged object, updated clocks, and whether anything changed.
 * Works with any object shape — the caller handles typing.
 */
export function mergeFields<T extends Record<string, unknown>>(
  local: T,
  localClocks: FieldClocks,
  remoteFields: Partial<T>,
  remoteClocks: FieldClocks,
): { merged: T; clocks: FieldClocks; changed: boolean } {
  const merged = { ...local }
  const clocks = { ...localClocks }
  let changed = false

  for (const [field, remoteClock] of Object.entries(remoteClocks)) {
    const localClock = localClocks[field]
    // Remote wins if: no local clock, or remote HLC is strictly greater
    if (!localClock || hlcGreaterThan(remoteClock, localClock)) {
      if (field in remoteFields) {
        (merged as Record<string, unknown>)[field] = (remoteFields as Record<string, unknown>)[field]
        clocks[field] = remoteClock
        changed = true
      }
    }
    // else: local wins, discard remote field
  }

  return { merged, clocks, changed }
}

/**
 * Merge clocks during broadcast coalescing.
 * When two changes to the same object are batched together, keep the
 * higher clock for each field.
 */
export function mergeClocks(a: FieldClocks, b: FieldClocks): FieldClocks {
  const result = { ...a }
  for (const [field, bClock] of Object.entries(b)) {
    const aClock = result[field]
    if (!aClock || hlcGreaterThan(bClock, aClock)) {
      result[field] = bClock
    }
  }
  return result
}

/**
 * Build FieldClocks for a set of fields using the given HLC.
 * Used when stamping outbound changes.
 */
export function stampFields(fields: string[], clock: HLC): FieldClocks {
  const clocks: FieldClocks = {}
  for (const field of fields) {
    clocks[field] = clock
  }
  return clocks
}

/**
 * Check if a delete (represented by its HLC) should win against an object's
 * current field clocks. Under add-wins semantics, the delete wins only if
 * its clock is >= every field clock on the object.
 */
export function shouldDeleteWin(deleteClock: HLC, objectClocks: FieldClocks): boolean {
  for (const fieldClock of Object.values(objectClocks)) {
    if (hlcGreaterThan(fieldClock, deleteClock)) {
      return false // a field update is newer than the delete → object survives
    }
  }
  return true
}
