/**
 * contextResolver — pure function that resolves the connection graph
 * for a given agent object on the board.
 *
 * Walks data_connector edges to find connected objects and returns
 * structured metadata for injection into the agent system prompt.
 * Heavy content (file text, frame children beyond metadata) is NOT
 * fetched here — those are lazy read tools called by the agent.
 */

import type { BoardObject } from '@/types/board'
import type { BoardState } from './boardState'

export interface ConnectedObjectMeta {
  id: string
  type: string
  text?: string
  title?: string
  file_name?: string
  mime_type?: string
  file_id?: string
  /** Frame child IDs (metadata only — use get_frame_objects tool for full data) */
  children?: string[]
}

/**
 * Resolve the connection graph rooted at `agentObjectId`.
 * Returns metadata for all objects connected via data_connector edges.
 * Deduplicates if multiple connectors point to the same object.
 * Ignores dangling edges (connected object deleted / not in state).
 */
export function resolveConnectionGraph(
  state: BoardState,
  agentObjectId: string,
): ConnectedObjectMeta[] {
  const seen = new Set<string>()
  const result: ConnectedObjectMeta[] = []

  for (const obj of state.objects.values()) {
    if (obj.type !== 'data_connector') continue
    if (obj.deleted_at) continue

    const isConnectedToAgent =
      obj.connect_start_id === agentObjectId ||
      obj.connect_end_id === agentObjectId

    if (!isConnectedToAgent) continue

    // Determine the "other" end of the connector
    const otherId =
      obj.connect_start_id === agentObjectId
        ? obj.connect_end_id
        : obj.connect_start_id

    if (!otherId || seen.has(otherId)) continue
    seen.add(otherId)

    const other = state.objects.get(otherId)
    if (!other || other.deleted_at) continue

    const meta: ConnectedObjectMeta = {
      id: other.id,
      type: other.type,
    }

    if (other.text) meta.text = other.text
    if (other.title) meta.title = other.title
    if (other.file_name) meta.file_name = other.file_name
    if (other.mime_type) meta.mime_type = other.mime_type
    if (other.file_id) meta.file_id = other.file_id

    if (other.type === 'frame') {
      // Include child IDs — agent can use get_frame_objects tool for full data
      const childIds: string[] = []
      for (const child of state.objects.values()) {
        if (child.parent_id === other.id && !child.deleted_at) {
          childIds.push(child.id)
        }
      }
      if (childIds.length > 0) meta.children = childIds
    }

    result.push(meta)
  }

  return result
}
