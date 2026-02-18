'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function BoardsHeader() {
  const [userName, setUserName] = useState<string>('')
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User'
        setUserName(name)
      }
    })
  }, [])

  const handleLogout = async () => {
    await supabaseRef.current.auth.signOut()
    router.push('/')
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 sm:px-8">
      <p className="text-base font-semibold text-indigo-600 sm:text-lg">
        <span className="font-extrabold">CollabBoard</span> | Welcome! {userName || '…'}
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded border border-red-500 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500 hover:text-white"
      >
        Logout
      </button>
    </header>
  )
}
