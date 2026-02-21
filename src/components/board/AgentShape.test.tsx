/**
 * Tests for AgentShape constants and module shape.
 * No Konva rendering — tests exported values only.
 */
import { describe, it, expect } from 'vitest'
import { AGENT_STATE_COLORS, AgentShape } from './AgentShape'

describe('AgentShape', () => {
  describe('AGENT_STATE_COLORS', () => {
    it('has keys: idle, thinking, done, error', () => {
      expect(Object.keys(AGENT_STATE_COLORS).sort()).toEqual(
        ['done', 'error', 'idle', 'thinking'],
      )
    })

    it('each value is a valid hex color string', () => {
      for (const [key, value] of Object.entries(AGENT_STATE_COLORS)) {
        expect(value, `${key} should be hex`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('idle is #8896A5', () => {
      expect(AGENT_STATE_COLORS.idle).toBe('#8896A5')
    })

    it('thinking is #5B8DEF', () => {
      expect(AGENT_STATE_COLORS.thinking).toBe('#5B8DEF')
    })

    it('done is #22C55E', () => {
      expect(AGENT_STATE_COLORS.done).toBe('#22C55E')
    })
  })

  describe('component export', () => {
    it('AgentShape is a function (memo-wrapped)', () => {
      expect(typeof AgentShape).toBe('object') // memo wraps into an object
      expect(AgentShape).toBeDefined()
      // React.memo components have a $$typeof
      expect((AgentShape as unknown as Record<string, unknown>).$$typeof).toBeDefined()
    })
  })
})
