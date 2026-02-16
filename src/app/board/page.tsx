import { createClient } from '@/lib/supabase/server'

export default async function BoardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      <p>Logged in as: {user?.email}</p>
    </div>
  )
}