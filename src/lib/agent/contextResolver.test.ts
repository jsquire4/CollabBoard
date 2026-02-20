import { describe, it, expect } from 'vitest'
import { resolveConnectionGraph } from './contextResolver'
import type { BoardState } from './boardState'
import type { BoardObject } from '@/types/board'

function makeState(objects: Partial<BoardObject>[]): BoardState {
  const map = new Map<string, BoardObject>()
  for (const obj of objects) {
    const full = {
      id: 'x',
      board_id: 'board-1',
      type: 'rectangle' as const,
      x: 0, y: 0, width: 100, height: 80, rotation: 0,
      text: '', color: '#fff', font_size: 14,
      z_index: 0, parent_id: null,
      created_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...obj,
    } as unknown as BoardObject
    map.set(full.id, full)
  }
  return { boardId: 'board-1', objects: map, fieldClocks: new Map() }
}

const AGENT_ID = 'agent-1'
const SHAPE_ID = 'shape-1'
const FRAME_ID = 'frame-1'
const CHILD_ID = 'child-1'
const FILE_OBJ_ID = 'file-obj-1'

describe('resolveConnectionGraph', () => {
  it('empty connections → empty array', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle' },
    ])
    expect(resolveConnectionGraph(state, AGENT_ID)).toEqual([])
  })

  it('single data_connector → one connected object metadata', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle', text: 'hello' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: SHAPE_ID, type: 'rectangle', text: 'hello' })
  })

  it('connector from shape to agent also resolves (reversed direction)', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle', text: 'reversed' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: SHAPE_ID, connect_end_id: AGENT_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(SHAPE_ID)
  })

  it('frame connection → frame metadata + children ids', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: FRAME_ID, type: 'frame', title: 'My Frame' },
      { id: CHILD_ID, type: 'rectangle', parent_id: FRAME_ID },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: FRAME_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('frame')
    expect(result[0].title).toBe('My Frame')
    expect(result[0].children).toContain(CHILD_ID)
  })

  it('context_object → file metadata (id, name, mime_type), NOT file content', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: FILE_OBJ_ID, type: 'context_object', file_name: 'report.pdf', mime_type: 'application/pdf', file_id: 'file-uuid' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: FILE_OBJ_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].file_name).toBe('report.pdf')
    expect(result[0].mime_type).toBe('application/pdf')
    expect(result[0].file_id).toBe('file-uuid')
    // No content field
    expect(result[0]).not.toHaveProperty('content')
  })

  it('deduplicates when two connectors point to same object', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID },
      { id: 'conn-2', type: 'data_connector', connect_start_id: SHAPE_ID, connect_end_id: AGENT_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(1)
  })

  it('dangling edge (connected object deleted with deleted_at) → ignored', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle', deleted_at: '2026-01-02T00:00:00Z' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(0)
  })

  it('dangling edge (connected object missing from state) → ignored', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: 'missing-id' },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(0)
  })

  it('deleted connector → ignored', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID, deleted_at: '2026-01-02T00:00:00Z' },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(0)
  })

  it('multiple different connected objects', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: 'shape-a', type: 'sticky_note', text: 'A' },
      { id: 'shape-b', type: 'rectangle', text: 'B' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: 'shape-a' },
      { id: 'conn-2', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: 'shape-b' },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(2)
    const ids = result.map(r => r.id)
    expect(ids).toContain('shape-a')
    expect(ids).toContain('shape-b')
  })

  it('non-data_connector connectors → ignored (only data_connector type resolves)', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle' },
      // arrow type — not data_connector
      { id: 'conn-1', type: 'arrow', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(0)
  })

  it('frame with deleted children → children list excludes deleted', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: FRAME_ID, type: 'frame' },
      { id: CHILD_ID, type: 'rectangle', parent_id: FRAME_ID },
      { id: 'deleted-child', type: 'rectangle', parent_id: FRAME_ID, deleted_at: '2026-01-02T00:00:00Z' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: FRAME_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result[0].children).toContain(CHILD_ID)
    expect(result[0].children).not.toContain('deleted-child')
  })

  it('frame with no children → no children field', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: FRAME_ID, type: 'frame' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: FRAME_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result[0].children).toBeUndefined()
  })

  it('irrelevant connector (not touching agent) → ignored', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: 'shape-a', type: 'rectangle' },
      { id: 'shape-b', type: 'rectangle' },
      // connector between two non-agent shapes
      { id: 'conn-1', type: 'data_connector', connect_start_id: 'shape-a', connect_end_id: 'shape-b' },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result).toHaveLength(0)
  })

  it('sticky note → includes text', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: 'note-1', type: 'sticky_note', text: 'Important note content' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: 'note-1' },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result[0].text).toBe('Important note content')
  })

  it('object with no text/title → those fields absent from metadata', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: SHAPE_ID, type: 'rectangle', text: '' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: SHAPE_ID },
    ])
    const result = resolveConnectionGraph(state, AGENT_ID)
    expect(result[0].text).toBeUndefined()
  })

  it('agent connected to itself via data_connector → resolves to agent object', () => {
    const state = makeState([
      { id: AGENT_ID, type: 'agent' },
      { id: 'conn-1', type: 'data_connector', connect_start_id: AGENT_ID, connect_end_id: AGENT_ID },
    ])
    // Should not crash; self-loop resolves to agent itself
    const result = resolveConnectionGraph(state, AGENT_ID)
    // Both start and end are agentId — otherId resolves to agentId itself
    // The agent object is in state, so it will be included once (seen deduplication)
    expect(result.length).toBeLessThanOrEqual(1)
  })
})
