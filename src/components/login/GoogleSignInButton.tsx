'use client'

interface GoogleSignInButtonProps {
  onClick: () => void
}

export function GoogleSignInButton({ onClick }: GoogleSignInButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/google-g.svg" alt="" className="h-6 w-6" width={24} height={24} />
      Sign in with Google
    </button>
  )
}
