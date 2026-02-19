type LogLevel = 'error' | 'warn' | 'info'

interface LogContext {
  message: string
  boardId?: string
  userId?: string
  objectId?: string
  operation?: string
  error?: unknown
  [key: string]: unknown
}

function formatEntry(level: LogLevel, ctx: LogContext): string {
  const parts = [`[${level.toUpperCase()}]`]
  if (ctx.operation) parts.push(`[${ctx.operation}]`)
  parts.push(ctx.message)
  if (ctx.boardId) parts.push(`board=${ctx.boardId.slice(0, 8)}`)
  if (ctx.userId) parts.push(`user=${ctx.userId.slice(0, 8)}`)
  if (ctx.objectId) parts.push(`obj=${ctx.objectId.slice(0, 8)}`)
  return parts.join(' ')
}

function extractError(ctx: LogContext): string | undefined {
  if (!ctx.error) return undefined
  if (ctx.error instanceof Error) return ctx.error.message
  if (typeof ctx.error === 'object' && ctx.error !== null && 'message' in ctx.error) {
    return (ctx.error as { message: string }).message
  }
  return String(ctx.error)
}

export const logger = {
  error(ctx: LogContext) {
    const msg = formatEntry('error', ctx)
    const errMsg = extractError(ctx)
    if (errMsg) {
      console.error(msg, errMsg)
    } else {
      console.error(msg)
    }
  },
  warn(ctx: LogContext) {
    const msg = formatEntry('warn', ctx)
    const errMsg = extractError(ctx)
    if (errMsg) {
      console.warn(msg, errMsg)
    } else {
      console.warn(msg)
    }
  },
  info(ctx: LogContext) {
    const msg = formatEntry('info', ctx)
    console.info(msg)
  },
}

export interface BoardLogger {
  error(ctx: Omit<LogContext, 'boardId' | 'userId'>): void
  warn(ctx: Omit<LogContext, 'boardId' | 'userId'>): void
  info(ctx: Omit<LogContext, 'boardId' | 'userId'>): void
}

export function createBoardLogger(boardId: string, userId: string): BoardLogger {
  const withIds = (ctx: Omit<LogContext, 'boardId' | 'userId'>): LogContext => ({
    ...ctx, boardId, userId, message: ctx.message,
  } as LogContext)
  return {
    error(ctx) { logger.error(withIds(ctx)) },
    warn(ctx) { logger.warn(withIds(ctx)) },
    info(ctx) { logger.info(withIds(ctx)) },
  }
}
