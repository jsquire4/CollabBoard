interface RetryOptions {
  /** The async operation to attempt. Must return/resolve to { error } shape. Supports PromiseLike (Supabase query builders). */
  operation: () => PromiseLike<{ error: { message: string } | null }>
  /** Called when all retries fail. */
  rollback?: () => void
  /** Called on final failure for user notification (e.g. toast). */
  onError?: (msg: string) => void
  /** Called on every failure for logging. */
  logError?: (error: { message: string }, attempt: number) => void
  /** Max number of total attempts (default: 2 = 1 retry). */
  maxRetries?: number
}

/**
 * Retry a Supabase-shaped operation with optional rollback and notification.
 * Returns true if succeeded, false if all retries exhausted.
 */
export async function retryWithRollback({
  operation,
  rollback,
  onError,
  logError,
  maxRetries = 2,
}: RetryOptions): Promise<boolean> {
  let lastError: { message: string } | undefined
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()
      if (!result.error) return true
      lastError = result.error
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
    logError?.(lastError!, attempt)
    if (attempt < maxRetries) {
      // Brief pause before retry
      await new Promise(r => setTimeout(r, 200 * attempt))
    }
  }
  // All retries failed
  rollback?.()
  onError?.('Operation failed. Please try again.')
  return false
}

/**
 * Fire-and-forget convenience: wraps a Supabase `.then()` chain with retry.
 * Returns the promise so callers can chain `.then()` if needed.
 */
export function fireAndRetry(opts: RetryOptions): Promise<boolean> {
  return retryWithRollback(opts)
}
