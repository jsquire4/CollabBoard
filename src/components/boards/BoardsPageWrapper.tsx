'use client'

import { type ReactNode } from 'react'
import { useDarkModeValue } from '@/hooks/useDarkMode'

export function BoardsPageWrapper({ children }: { children: ReactNode }) {
  const dk = useDarkModeValue()

  return (
    <div className={`min-h-screen ${dk ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {children}
    </div>
  )
}
