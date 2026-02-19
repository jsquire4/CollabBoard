import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger, createBoardLogger } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('logs error with formatted message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error({ message: 'test error', operation: 'addObject' })
    expect(spy).toHaveBeenCalledWith('[ERROR] [addObject] test error')
  })

  it('logs error with error detail', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error({ message: 'fail', error: { message: 'db error' } })
    expect(spy).toHaveBeenCalledWith('[ERROR] fail', 'db error')
  })

  it('logs error with Error instance', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error({ message: 'fail', error: new Error('oops') })
    expect(spy).toHaveBeenCalledWith('[ERROR] fail', 'oops')
  })

  it('includes board and user IDs when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error({ message: 'test', boardId: '12345678-abcd', userId: 'abcd1234-efgh' })
    expect(spy).toHaveBeenCalledWith('[ERROR] test board=12345678 user=abcd1234')
  })

  it('includes object ID when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error({ message: 'test', objectId: 'obj12345-xyz' })
    expect(spy).toHaveBeenCalledWith('[ERROR] test obj=obj12345')
  })

  it('logs warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn({ message: 'warning', operation: 'sync' })
    expect(spy).toHaveBeenCalledWith('[WARN] [sync] warning')
  })

  it('logs info messages', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info({ message: 'connected', operation: 'channel' })
    expect(spy).toHaveBeenCalledWith('[INFO] [channel] connected')
  })
})

describe('createBoardLogger', () => {
  it('prefixes boardId and userId automatically', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = createBoardLogger('board-123-long', 'user-456-long')
    log.error({ message: 'fail', operation: 'update' })
    expect(spy).toHaveBeenCalledWith('[ERROR] [update] fail board=board-12 user=user-456')
  })

  it('works for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = createBoardLogger('b1234567', 'u7654321')
    log.warn({ message: 'slow' })
    expect(spy).toHaveBeenCalledWith('[WARN] slow board=b1234567 user=u7654321')
  })

  it('works for info level', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const log = createBoardLogger('b1234567', 'u7654321')
    log.info({ message: 'ok' })
    expect(spy).toHaveBeenCalledWith('[INFO] ok board=b1234567 user=u7654321')
  })
})
