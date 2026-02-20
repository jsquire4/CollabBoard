'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDarkModeValue } from '@/hooks/useDarkMode'
import { getUserDisplayName } from '@/lib/userUtils'

export function BoardsHeader() {
  const [userName, setUserName] = useState<string>('')
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  const dk = useDarkModeValue()

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
    <header className={`flex items-center justify-between gap-4 border-b px-6 py-4 sm:px-8 ${dk ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      <p className={`text-base font-semibold sm:text-lg ${dk ? 'text-indigo-400' : 'text-indigo-600'}`}>
        <span className="font-extrabold">CollabBoard</span> | Welcome! {userName || '…'}
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className={`rounded border px-4 py-2 text-sm font-medium transition ${dk ? 'border-red-400 text-red-400 hover:bg-red-400 hover:text-white' : 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white'}`}
      >
        Logout
      </button>
    </header>
  )
}
