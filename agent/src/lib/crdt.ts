/**
 * Per-field LWW merge logic — inlined from src/lib/crdt/merge.ts.
 * Must stay in sync with the canonical implementation.
 */

import { HLC, hlcGreaterThan } from './hlc.js'

export type FieldClocks = Record<string, HLC>

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
    if (!localClock || hlcGreaterThan(remoteClock, localClock)) {
      if (field in remoteFields) {
        (merged as Record<string, unknown>)[field] = (remoteFields as Record<string, unknown>)[field]
        clocks[field] = remoteClock
        changed = true
      }
    }
  }

  return { merged, clocks, changed }
}

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

export function stampFields(fields: string[], clock: HLC): FieldClocks {
  const clocks: FieldClocks = {}
  for (const field of fields) {
    clocks[field] = clock
  }
  return clocks
}
