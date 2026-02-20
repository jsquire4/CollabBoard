import Link from 'next/link'

interface HeroProps {
  isAuthenticated: boolean
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
        className="-z-10 absolute -left-[2500px] -top-[2500px] h-[calc(100%+5000px)] w-[calc(100%+5000px)] bg-[linear-gradient(to_right,rgba(232,227,218,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(232,227,218,0.4)_1px,transparent_1px)] bg-[size:3rem_3rem]"
      />

      {/* Blurred canvas mockup — Theorem palette, pointer-events-none */}
      <div className="pointer-events-none absolute inset-0 -z-10 [filter:blur(1.5px)] opacity-85">
        <svg className="absolute inset-0 h-full w-full" viewBox="-200 -80 1000 560" preserveAspectRatio="xMidYMid meet">
          {/* Connectors — leather and navy dotted lines */}
          <path d="M 100 50 L 180 120" stroke="rgba(196,154,108,0.4)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 80 180 L 150 260" stroke="rgba(27,58,107,0.3)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 520 80 L 480 200" stroke="rgba(196,154,108,0.4)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 480 240 L 380 320" stroke="rgba(27,58,107,0.3)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 120 300 L 350 340" stroke="rgba(196,154,108,0.4)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 250 80 L 320 140" stroke="rgba(27,58,107,0.3)" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 380 160 L 420 220" stroke="rgba(196,154,108,0.4)" strokeWidth="1" strokeDasharray="4 4" />

          {/* Shapes — Theorem palette: parchment, navy tint, leather tint */}
          <g transform="rotate(-8 -20 10)">
            <rect x="-50" y="-25" width="70" height="38" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="-42" y="-5" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Ideas</text>
          </g>
          <g transform="rotate(5 680 15)">
            <rect x="600" y="-20" width="90" height="36" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="608" y="2" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Backlog</text>
          </g>
          <g transform="rotate(-3 -30 200)">
            <rect x="-70" y="160" width="58" height="50" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-62" y="188" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Notes</text>
          </g>
          <g transform="rotate(6 650 380)">
            <rect x="590" y="350" width="95" height="48" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="598" y="375" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Done</text>
          </g>
          <g transform="rotate(-5 50 380)">
            <rect x="-10" y="340" width="80" height="55" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-2" y="368" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Review</text>
          </g>
          <g transform="rotate(4 120 60)">
            <rect x="50" y="25" width="75" height="42" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="58" y="50" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Big Idea</text>
          </g>
          <g transform="rotate(-2 180 130)">
            <rect x="130" y="95" width="68" height="48" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="138" y="118" fontSize="10" fontWeight="700" fill="rgb(28,28,30)">Project</text>
          </g>
          <g transform="rotate(3 500 100)">
            <rect x="455" y="55" width="72" height="40" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="463" y="78" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">TODO</text>
          </g>
          <g transform="rotate(-4 480 250)">
            <rect x="430" y="215" width="70" height="52" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="438" y="240" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Goals</text>
          </g>
          <g transform="rotate(2 150 300)">
            <rect x="95" y="270" width="78" height="44" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="103" y="295" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Capture</text>
          </g>
          <g transform="rotate(-6 520 320)">
            <rect x="470" y="285" width="110" height="50" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="515" y="312" fontSize="11" fontWeight="700" fill="rgb(28,28,30)" textAnchor="middle">Brainstorm</text>
          </g>
          <g transform="rotate(7 80 120)">
            <rect x="30" y="85" width="55" height="35" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="38" y="106" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Q1</text>
          </g>
          <g transform="rotate(-4 580 180)">
            <rect x="545" y="145" width="60" height="38" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="553" y="168" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Later</text>
          </g>
          {/* Additional shapes */}
          <g transform="rotate(6 -45 350)">
            <rect x="-85" y="320" width="65" height="42" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="-77" y="344" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Blockers</text>
          </g>
          <g transform="rotate(-3 680 -10)">
            <rect x="640" y="-35" width="72" height="40" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="648" y="-12" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Sprint</text>
          </g>
          <g transform="rotate(4 320 50)">
            <rect x="280" y="15" width="58" height="36" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="288" y="38" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">MVP</text>
          </g>
          <g transform="rotate(-5 420 350)">
            <rect x="375" y="325" width="70" height="42" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="383" y="348" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Feedback</text>
          </g>
          <g transform="rotate(3 -20 80)">
            <rect x="-55" y="55" width="62" height="38" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="-47" y="78" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Scope</text>
          </g>
          <g transform="rotate(-2 620 250)">
            <rect x="575" y="220" width="68" height="45" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="583" y="244" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Launch</text>
          </g>
          <g transform="rotate(5 100 350)">
            <rect x="55" y="330" width="72" height="40" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="63" y="353" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Next Steps</text>
          </g>
          <g transform="rotate(-7 380 80)">
            <rect x="340" y="50" width="65" height="38" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="348" y="72" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Research</text>
          </g>
          <g transform="rotate(2 200 280)">
            <rect x="165" y="255" width="58" height="36" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="173" y="277" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Draft</text>
          </g>
          <g transform="rotate(-4 550 380)">
            <rect x="505" y="355" width="75" height="42" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="513" y="378" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Phase 2</text>
          </g>
          <g transform="rotate(6 50 250)">
            <rect x="-15" y="225" width="55" height="35" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-7" y="247" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">UX</text>
          </g>
          <g transform="rotate(-3 620 100)">
            <rect x="585" y="75" width="60" height="38" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="593" y="97" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Design</text>
          </g>
          {/* Left group */}
          <g transform="rotate(-5 -140 50)">
            <rect x="-190" y="15" width="75" height="42" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-182" y="40" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Roadmap</text>
          </g>
          <g transform="rotate(4 -120 180)">
            <rect x="-180" y="155" width="68" height="45" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="-172" y="180" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Spec</text>
          </g>
          <g transform="rotate(-3 -150 320)">
            <rect x="-210" y="290" width="72" height="48" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="-202" y="315" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Explore</text>
          </g>
          <g transform="rotate(6 -80 -20)">
            <rect x="-130" y="-55" width="65" height="38" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-122" y="-32" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Wishlist</text>
          </g>
          <g transform="rotate(-2 -170 420)">
            <rect x="-230" y="395" width="70" height="42" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="-222" y="418" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Archive</text>
          </g>
          <g transform="rotate(5 -50 100)">
            <rect x="-100" y="75" width="58" height="36" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="-92" y="97" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Bugs</text>
          </g>
          <g transform="rotate(-4 -130 250)">
            <rect x="-195" y="225" width="62" height="40" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="-187" y="248" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Pivot</text>
          </g>
          <g transform="rotate(3 -200 150)">
            <rect x="-260" y="125" width="70" height="42" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="-252" y="148" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Q2</text>
          </g>
          {/* Right group */}
          <g transform="rotate(-4 680 60)">
            <rect x="620" y="25" width="75" height="42" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="628" y="50" fontSize="10" fontWeight="600" fill="rgb(28,28,30)">Timeline</text>
          </g>
          <g transform="rotate(5 820 200)">
            <rect x="760" y="175" width="68" height="48" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="768" y="200" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Milestone</text>
          </g>
          <g transform="rotate(-3 780 350)">
            <rect x="720" y="325" width="72" height="45" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="728" y="350" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Shipped</text>
          </g>
          <g transform="rotate(6 900 -15)">
            <rect x="840" y="-50" width="70" height="38" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="848" y="-27" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Priority</text>
          </g>
          <g transform="rotate(-2 650 420)">
            <rect x="585" y="395" width="78" height="42" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="593" y="418" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Follow-up</text>
          </g>
          <g transform="rotate(4 830 100)">
            <rect x="770" y="75" width="65" height="40" rx="4" fill="rgb(250,240,225)" stroke="rgb(196,154,108)" strokeWidth="1.5" strokeOpacity="0.6" />
            <text x="778" y="98" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">R&amp;D</text>
          </g>
          <g transform="rotate(-5 750 280)">
            <rect x="685" y="255" width="58" height="38" rx="4" fill="rgb(240,235,227)" stroke="rgb(232,227,218)" strokeWidth="1.5" />
            <text x="693" y="280" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Beta</text>
          </g>
          <g transform="rotate(3 950 180)">
            <rect x="890" y="155" width="68" height="45" rx="4" fill="rgb(219,228,243)" stroke="rgb(27,58,107)" strokeWidth="1.5" strokeOpacity="0.3" />
            <text x="898" y="180" fontSize="9" fontWeight="600" fill="rgb(28,28,30)">Ideation</text>
          </g>
        </svg>
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
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-navy px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-navy/30 transition-all hover:bg-navy/90 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
            >
              Start thinking
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/login"
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
