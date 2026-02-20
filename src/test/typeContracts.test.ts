import { describe, it, expect } from 'vitest'
import { makeObject } from './boardObjectFactory'
import type { BoardObjectType } from '@/types/board'

const ALL_TYPES: BoardObjectType[] = [
  'sticky_note', 'rectangle', 'circle', 'frame', 'group',
  'line', 'triangle', 'chevron', 'arrow', 'parallelogram', 'ngon',
  'table', 'file',
  'data_connector', 'context_object', 'agent', 'agent_output',
  'text', 'status_badge', 'section_header', 'metric_card',
  'checklist', 'api_object',
]

describe('BoardObjectType exhaustiveness', () => {
  it('ALL_TYPES list has no duplicates', () => {
    expect(new Set(ALL_TYPES).size).toBe(ALL_TYPES.length)
  })

  it('makeObject accepts every BoardObjectType without throwing', () => {
    for (const type of ALL_TYPES) {
      expect(() => makeObject({ type })).not.toThrow()
    }
  })

  it('has exactly 23 types', () => {
    expect(ALL_TYPES).toHaveLength(23)
  })
})
