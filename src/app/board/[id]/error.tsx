'use client'

/**
 * Error boundary for the /board/[id] route segment.
 * Catches DB fetch failures, auth errors, or unexpected throws from BoardClient.
 */

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BoardError({ reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <h2 className="text-2xl font-semibold text-slate-900">Failed to load board</h2>
      <p className="max-w-md text-slate-600">
        There was a problem loading this board. Try refreshing, or go back to your boards list.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Try again
        </button>
        <a
          href="/boards"
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          My boards
        </a>
      </div>
    </div>
  )
}
