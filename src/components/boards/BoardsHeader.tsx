'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserDisplayName } from '@/lib/userUtils'

export function BoardsHeader() {
  const [userName, setUserName] = useState<string>('')
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(getUserDisplayName(user))
      }
    })
  }, [])

  const handleLogout = async () => {
    await supabaseRef.current.auth.signOut()
    router.push('/')
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-parchment-border bg-parchment px-6 py-4 sm:px-8">
      <p className="text-base font-semibold text-navy sm:text-lg">
        <span className="font-extrabold">Theorem</span> · {userName || '…'}
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded border border-charcoal/20 px-4 py-2 text-sm font-medium text-charcoal/50 transition hover:border-charcoal/40 hover:text-charcoal"
      >
        Logout
      </button>
    </header>
  )
}
