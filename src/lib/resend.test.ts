import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Resend singleton', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('exports a Resend instance when RESEND_API_KEY is set', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_123')
    const { resend } = await import('./resend')
    expect(resend).toBeDefined()
    expect(resend.emails).toBeDefined()
  })

  it('logs a warning when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { resend } = await import('./resend')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'))
    expect(resend).toBeDefined()
    warnSpy.mockRestore()
  })

  it('exports an instance with emails.send available', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_456')
    const { resend } = await import('./resend')
    expect(typeof resend.emails.send).toBe('function')
  })
})
