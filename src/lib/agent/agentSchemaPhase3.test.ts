import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(__dirname, '../../../supabase/migrations/20260222000000_board_agents_phase3.sql')

describe('Phase 3 DB migration', () => {
  it('migration file exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it('creates comments table with all 9 columns', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/CREATE TABLE comments/)
    for (const col of [
      'id', 'board_id', 'object_id', 'user_id', 'user_display_name',
      'content', 'resolved_at', 'parent_id', 'created_at',
    ]) {
      expect(sql).toMatch(new RegExp(col))
    }
  })

  it('creates index idx_comments_board_object', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/idx_comments_board_object/)
  })

  it('creates index idx_comments_parent', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/idx_comments_parent/)
  })

  it('enables row level security on comments', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })

  it('creates set_comment_user trigger function with SECURITY DEFINER', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/set_comment_user/)
    expect(sql).toMatch(/SECURITY DEFINER/)
  })

  it('creates comments_set_user trigger', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/CREATE TRIGGER comments_set_user/)
  })

  it('defines RLS policies for SELECT, INSERT, UPDATE, DELETE', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/FOR SELECT/)
    expect(sql).toMatch(/FOR INSERT/)
    expect(sql).toMatch(/FOR UPDATE/)
    expect(sql).toMatch(/FOR DELETE/)
  })

  it('adds comments to supabase_realtime publication', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE comments/)
  })

  it('drops existing comments table before recreating', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/DROP TABLE IF EXISTS comments CASCADE/)
  })

  it('guards DROP TABLE with a non-empty check', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql).toMatch(/refusing to drop/)
  })

  it('DROP TABLE appears before CREATE TABLE', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8')
    expect(sql.indexOf('DROP TABLE')).toBeLessThan(sql.indexOf('CREATE TABLE comments'))
  })
})
