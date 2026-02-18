import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/50 px-6 py-12 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} CollabBoard. Built for real-time collaboration.
        </p>
        <div className="flex gap-8 text-sm">
          <Link href="/login" className="text-slate-500 transition hover:text-indigo-600">
            Sign in
          </Link>
          <Link href="/boards" className="text-slate-500 transition hover:text-indigo-600">
            My Boards
          </Link>
        </div>
      </div>
    </footer>
  )
}
