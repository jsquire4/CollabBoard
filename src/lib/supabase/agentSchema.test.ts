import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations')
const migrationFile = path.join(migrationsDir, '20260220400000_board_agents_phase1.sql')

describe('Phase 1 migration', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(migrationFile)).toBe(true)
  })

  it('migration references agent_state column', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('agent_state')
  })

  it('migration references source_agent_id column', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('source_agent_id')
  })

  it('migration references formula column', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('formula')
  })

  it('migration references is_slide column', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('is_slide')
  })

  it('migration references files table', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS files')
  })

  it('migration references decks table', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS decks')
  })

  it('migration references comments table', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS comments')
  })

  it('migration references file_board_shares table', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS file_board_shares')
  })
})
