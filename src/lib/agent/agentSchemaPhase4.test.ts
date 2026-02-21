import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(__dirname, '../../../supabase/migrations/20260222100000_agent_access_by_role.sql')

describe('Phase 4 DB migration — agent access by role', () => {
  it('migration file exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('sets can_use_agents default to true', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/can_use_agents SET DEFAULT true/)
  })

  it('backfills existing owner/manager rows', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/UPDATE board_members/)
    expect(sql).toMatch(/role IN \('owner', 'manager'\)/)
  })

  it('creates enforce_agent_access_by_role function and trigger', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/enforce_agent_access_by_role/)
    expect(sql).toMatch(/CREATE TRIGGER trigger_enforce_agent_access_by_role/)
  })

  it('replaces create_board_owner with can_use_agents', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION create_board_owner/)
    expect(sql).toMatch(/can_use_agents/)
  })

  it('drops and recreates get_board_member_details with can_use_agents', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS get_board_member_details/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_board_member_details/)
    expect(sql).toMatch(/can_use_agents BOOLEAN/)
  })

  it('get_board_member_details has SECURITY DEFINER', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/SECURITY DEFINER/)
  })
})
