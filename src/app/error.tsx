'use client'

/**
 * App-level error boundary for the root layout segment.
 * Catches unhandled exceptions thrown by any page or layout child.
 */

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AppError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <h2 className="text-2xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="max-w-md text-slate-600">
        An unexpected error occurred. Try refreshing the page or going back to the home page.
      </p>
      {error.digest && (
        <p className="text-xs text-slate-400">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Go home
        </a>
      </div>
    </div>
  )
}
