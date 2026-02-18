import Link from 'next/link'

interface HeroProps {
  isAuthenticated: boolean
}

export function Hero({ isAuthenticated }: HeroProps) {
  return (
    <section className="relative flex min-h-[75vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Layered gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.2),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(139,92,246,0.12),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_30%_at_20%_80%,rgba(59,130,246,0.1),transparent_50%)]" />

      {/* Grid pattern */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)]" />

      {/* Floating decorative shapes */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[15%] top-[25%] h-16 w-16 rounded-2xl border border-indigo-200/60 bg-indigo-50/40 opacity-60 animate-float" />
        <div className="absolute right-[20%] top-[35%] h-12 w-12 rounded-full border border-violet-200/50 bg-violet-50/30 opacity-50 animate-float-delayed" />
        <div className="absolute bottom-[30%] left-[25%] h-10 w-10 rotate-45 rounded-lg border border-blue-200/40 bg-blue-50/30 opacity-40 animate-float-slow" />
        <div className="absolute bottom-[25%] right-[30%] h-14 w-14 rounded-xl border border-indigo-200/40 bg-white/50 opacity-50 animate-float" />
      </div>

      {/* Badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/90 px-4 py-1.5 text-sm font-medium text-indigo-700 shadow-sm backdrop-blur-sm opacity-0 animate-fade-in">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
        </span>
        Real-time collaboration
      </div>

      <h1 className="font-display text-5xl font-bold tracking-tight text-slate-900 opacity-0 sm:text-6xl md:text-7xl lg:text-8xl animate-fade-in" style={{ animationDelay: '0.1s' }}>
        CollabBoard
      </h1>
      <p className="mt-5 max-w-xl text-lg text-slate-600 opacity-0 sm:text-xl animate-fade-in" style={{ animationDelay: '0.2s' }}>
        A real-time collaborative whiteboard. Create, share, and iterate together.
      </p>
      <div className="mt-12 opacity-0 animate-fade-in" style={{ animationDelay: '0.3s' }}>
        {isAuthenticated ? (
          <Link
            href="/boards"
            className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Go to My Boards
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        ) : (
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Get Started
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        )}
      </div>
    </section>
  )
}
