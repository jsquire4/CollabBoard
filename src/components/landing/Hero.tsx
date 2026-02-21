import Link from 'next/link'
import { HeroIllustration } from './HeroIllustration'

interface HeroProps {
  isAuthenticated: boolean
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}

export function Hero({ isAuthenticated }: HeroProps) {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-24 text-center sm:py-32">
      {/* Warm radial tints — navy top, BRG right, leather bottom-left */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(27,58,107,0.06),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(30,67,48,0.04),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_30%_at_20%_80%,rgba(196,154,108,0.05),transparent_50%)]" />

      {/* Grid pattern — warm parchment-border tones, extends far beyond viewport */}
      <div
        aria-hidden="true"
        className="-z-10 absolute -left-[2500px] -top-[2500px] h-[calc(100%+5000px)] w-[calc(100%+5000px)] bg-[linear-gradient(to_right,rgba(232,227,218,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(232,227,218,0.4)_1px,transparent_1px)] bg-[size:3rem_3rem]"
      />

      {/* Blurred canvas mockup — Theorem palette, pointer-events-none */}
      <div className="pointer-events-none absolute inset-0 -z-10 [filter:blur(1.5px)] opacity-85">
        <HeroIllustration />
      </div>

      {/* Warm parchment center backdrop — text legibility */}
      <div className="absolute inset-0 -z-[5] bg-[radial-gradient(ellipse_55%_50%_at_50%_48%,rgba(250,248,244,0.92)_0%,rgba(250,248,244,0.4)_50%,transparent_75%)]" />

      {/* Headline */}
      <h1 className="relative z-10 font-display text-5xl font-normal tracking-tight text-charcoal opacity-0 drop-shadow-sm sm:text-6xl md:text-7xl animate-fade-in [animation-delay:0.1s]">
        Where hypotheses become theorems.
      </h1>

      {/* Subhead */}
      <p className="relative z-10 mt-6 max-w-2xl text-lg text-charcoal/70 opacity-0 sm:text-xl animate-fade-in [animation-delay:0.2s]">
        An intelligent strategy canvas for teams that think in frameworks. AI-powered synthesis, real-time collaboration, and a structured workspace that moves as fast as your thinking.
      </p>

      {/* CTAs */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-3 opacity-0 sm:flex-row sm:justify-center animate-fade-in [animation-delay:0.3s]">
        {isAuthenticated ? (
          <Link
            href="/boards"
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-navy/30 transition-all hover:bg-navy/90 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
          >
            Open Theorem
            <ArrowIcon />
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-navy px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-navy/30 transition-all hover:bg-navy/90 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
            >
              Start thinking
              <ArrowIcon />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-navy px-8 py-3.5 text-base font-semibold text-navy transition-all hover:bg-navy/5 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
            >
              See it in action
            </Link>
          </>
        )}
      </div>

      {/* Status badge */}
      <div className="relative z-10 mt-8 flex items-center justify-center gap-2 rounded-full border border-navy/30 bg-parchment/90 px-4 py-1.5 text-sm font-medium text-navy shadow-sm backdrop-blur-sm opacity-0 animate-fade-in [animation-delay:0.4s]">
        <div className="grid h-2 w-2 shrink-0 place-items-center overflow-visible leading-[0]">
          <div className="col-start-1 row-start-1 h-2 w-2 rounded-full bg-navy" />
          <div className="col-start-1 row-start-1 h-2 w-2 origin-center animate-ping rounded-full bg-navy/60 opacity-75" />
        </div>
        <span>Intelligent canvas · Real-time · AI-powered</span>
      </div>
    </section>
  )
}
