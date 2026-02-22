/**
 * Tests for validateEnv — startup environment variable validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSupabaseEnv } from './validateEnv'

describe('getSupabaseEnv', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns url and anonKey when both env vars are set', () => {
    const result = getSupabaseEnv()
    expect(result).toEqual({
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
    })
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    expect(() => getSupabaseEnv()).toThrow('Missing required env var: NEXT_PUBLIC_SUPABASE_URL')
  })

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined)
    expect(() => getSupabaseEnv()).toThrow('Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })
})
