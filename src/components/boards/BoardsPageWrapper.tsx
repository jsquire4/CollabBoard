import { type ReactNode } from 'react'

export function BoardsPageWrapper({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      {children}
    </main>
  )
}
