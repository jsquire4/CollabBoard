import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-parchment-border bg-parchment-dark px-6 py-12 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.04)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <p className="text-sm text-charcoal/50">
          © {new Date().getFullYear()} Theorem. The intelligent strategy canvas.
        </p>
        <div className="flex gap-8 text-sm">
          <Link href="/login" className="text-charcoal/50 transition hover:text-navy">
            Sign in
          </Link>
          <Link href="/boards" className="text-charcoal/50 transition hover:text-navy">
            Open Theorem
          </Link>
        </div>
      </div>
    </footer>
  )
}
