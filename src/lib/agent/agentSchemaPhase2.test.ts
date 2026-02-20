import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(__dirname, '../../../supabase/migrations/20260221000000_board_agents_phase2.sql')

describe('Phase 2 DB migration', () => {
  it('migration file exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('adds agent_object_id to board_messages', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/agent_object_id/)
  })

  it('adds user_display_name to board_messages', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/user_display_name/)
  })

  it('adds global_agent_thread_id to boards', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/global_agent_thread_id/)
  })

  it('adds index on board_messages(board_id, agent_object_id)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/idx_board_messages_agent_object/)
  })

  it('adds model column to board_objects', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS model/)
  })
})
