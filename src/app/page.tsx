import { createClient } from '@/lib/supabase/server'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen bg-slate-50">
      <Hero isAuthenticated={!!user} />
      <Features />
    </main>
  )
}
