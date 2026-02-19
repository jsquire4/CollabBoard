import { describe, it, expect, vi } from 'vitest'
import { retryWithRollback, fireAndRetry } from './retryWithRollback'

describe('retryWithRollback', () => {
  it('returns true on first success', async () => {
    const op = vi.fn().mockResolvedValue({ error: null })
    const result = await retryWithRollback({ operation: op })
    expect(result).toBe(true)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries once on failure then succeeds', async () => {
    const op = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: null })
    const logError = vi.fn()
    const result = await retryWithRollback({ operation: op, logError, maxRetries: 2 })
    expect(result).toBe(true)
    expect(op).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledWith({ message: 'timeout' }, 1)
  })

  it('calls rollback and onError after all retries fail', async () => {
    const op = vi.fn().mockResolvedValue({ error: { message: 'fail' } })
    const rollback = vi.fn()
    const onError = vi.fn()
    const logError = vi.fn()
    const result = await retryWithRollback({
      operation: op,
      rollback,
      onError,
      logError,
      maxRetries: 2,
    })
    expect(result).toBe(false)
    expect(op).toHaveBeenCalledTimes(2)
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('Operation failed. Please try again.')
    expect(logError).toHaveBeenCalledTimes(2)
  })

  it('works with maxRetries=1 (no retry)', async () => {
    const op = vi.fn().mockResolvedValue({ error: { message: 'fail' } })
    const rollback = vi.fn()
    const result = await retryWithRollback({ operation: op, rollback, maxRetries: 1 })
    expect(result).toBe(false)
    expect(op).toHaveBeenCalledTimes(1)
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('skips rollback and onError if not provided', async () => {
    const op = vi.fn().mockResolvedValue({ error: { message: 'fail' } })
    const result = await retryWithRollback({ operation: op, maxRetries: 1 })
    expect(result).toBe(false)
  })

  it('works with maxRetries=3', async () => {
    const op = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'fail' } })
      .mockResolvedValueOnce({ error: { message: 'fail' } })
      .mockResolvedValueOnce({ error: null })
    const result = await retryWithRollback({ operation: op, maxRetries: 3 })
    expect(result).toBe(true)
    expect(op).toHaveBeenCalledTimes(3)
  })
})

describe('fireAndRetry', () => {
  it('runs operation without awaiting', async () => {
    const op = vi.fn().mockResolvedValue({ error: null })
    fireAndRetry({ operation: op })
    // Give it a tick to resolve
    await new Promise(r => setTimeout(r, 10))
    expect(op).toHaveBeenCalledTimes(1)
  })
})
