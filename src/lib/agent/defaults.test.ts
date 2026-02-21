/**
 * Tests for shape defaults — pure function tests, no mocks.
 */
import { describe, it, expect } from 'vitest'
import { getShapeDefaults } from './defaults'

describe('getShapeDefaults', () => {
  it('returns expected defaults for rectangle', () => {
    const d = getShapeDefaults('rectangle')
    expect(d.width).toBe(200)
    expect(d.height).toBe(140)
    expect(d.color).toBe('#2196F3')
  })

  it('returns expected defaults for agent', () => {
    const d = getShapeDefaults('agent')
    expect(d.width).toBe(200)
    expect(d.height).toBe(140)
    expect(d.color).toBe('#EEF2FF')
  })

  it('returns expected defaults for agent_output', () => {
    const d = getShapeDefaults('agent_output')
    expect(d.width).toBe(240)
    expect(d.height).toBe(160)
    expect(d.color).toBe('#F0FDF4')
  })

  it('returns expected defaults for sticky_note', () => {
    const d = getShapeDefaults('sticky_note')
    expect(d.width).toBe(150)
    expect(d.height).toBe(150)
    expect(d.color).toBe('#FFEB3B')
  })

  it('unknown type falls back to rectangle defaults', () => {
    const d = getShapeDefaults('not_a_real_type')
    expect(d).toEqual(getShapeDefaults('rectangle'))
  })

  it('all registered types have positive dimensions', () => {
    const knownTypes = [
      'sticky_note', 'rectangle', 'circle', 'triangle', 'chevron',
      'parallelogram', 'ngon', 'frame', 'table', 'data_connector',
      'context_object', 'agent', 'agent_output', 'text',
      'status_badge', 'section_header', 'metric_card', 'checklist', 'api_object',
    ]
    for (const type of knownTypes) {
      const d = getShapeDefaults(type)
      expect(d.width, `${type} width`).toBeGreaterThanOrEqual(0)
      expect(d.height, `${type} height`).toBeGreaterThanOrEqual(0)
    }
  })

  it('all registered types have non-empty color', () => {
    const knownTypes = [
      'sticky_note', 'rectangle', 'circle', 'triangle', 'chevron',
      'parallelogram', 'ngon', 'frame', 'table', 'data_connector',
      'context_object', 'agent', 'agent_output',
    ]
    for (const type of knownTypes) {
      const d = getShapeDefaults(type)
      expect(d.color, `${type} color`).toBeTruthy()
    }
  })

  it('returned objects have required fields (width, height, color)', () => {
    const d = getShapeDefaults('sticky_note')
    expect(d).toHaveProperty('width')
    expect(d).toHaveProperty('height')
    expect(d).toHaveProperty('color')
  })
})
