/**
 * Chainable mock for createAdminClient() — compatible with Supabase's fluent API.
 */

import { vi } from 'vitest'

export interface ChainMockOptions {
  select?: { data: unknown[]; error: null } | { data: null; error: { message: string } }
  insert?: { data: null; error: null } | { data: null; error: { message: string } }
  update?: { data: null; error: null } | { data: null; error: { message: string } }
  single?: { data: unknown; error: null } | { data: null; error: { message: string } }
}

export interface ChainMock {
  from: ReturnType<typeof vi.fn>
  storage: {
    from: ReturnType<typeof vi.fn>
  }
}

/**
 * Create a chainable Supabase admin mock.
 */
export function createChainMock(defaults: ChainMockOptions = {}): ChainMock {
  const selectResult = defaults.select ?? { data: [], error: null }
  const insertResult = defaults.insert ?? { data: null, error: null }
  const updateResult = defaults.update ?? { data: null, error: null }
  const singleResult = defaults.single ?? { data: null, error: null }

  const terminalSelect = { ...selectResult }
  const terminalSingle = { ...singleResult }

  const selectChain = {
    eq: vi.fn(function(this: unknown) { return selectChain }),
    neq: vi.fn(function(this: unknown) { return selectChain }),
    is: vi.fn(function(this: unknown) { return selectChain }),
    order: vi.fn(function(this: unknown) { return selectChain }),
    limit: vi.fn(() => Promise.resolve(terminalSelect)),
    single: vi.fn(() => Promise.resolve(terminalSingle)),
    then: (resolve: (v: unknown) => void) => resolve(terminalSelect),
  }

  const updateChain = {
    eq: vi.fn(function(this: unknown) { return updateChain }),
    is: vi.fn(() => Promise.resolve(updateResult)),
    then: (resolve: (v: unknown) => void) => resolve(updateResult),
  }

  const from = vi.fn(() => ({
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => Promise.resolve(insertResult)),
    update: vi.fn(() => updateChain),
  }))

  const storage = {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(['file content']), error: null }),
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  }

  return { from, storage }
}

/** Create a mock of the createAdminClient module that returns a chainMock. */
export function mockAdminClient(opts: ChainMockOptions = {}): ChainMock {
  const client = createChainMock(opts)
  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(() => client),
  }))
  return client
}
