import { createClient } from '@/lib/supabase/server'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { Footer } from '@/components/landing/Footer'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Base parchment gradient */}
      <div className="fixed inset-0 -z-20 bg-gradient-to-b from-parchment via-parchment to-parchment-dark" />
      {/* Soft top highlight */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_60%_at_50%_-20%,color-mix(in_srgb,var(--color-parchment)_90%,transparent),transparent_70%)]" />
      {/* Subtle vignette at edges */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_0%,rgba(0,0,0,0.02)_100%)]" />
      {/* Subtle parchment dot texture for tactile feel */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--color-parchment-border)_40%,transparent)_1px,transparent_1px)] bg-[length:24px_24px]" />
      <Hero isAuthenticated={!!user} />
      <Features />
      <Footer />
    </main>
  )
}
