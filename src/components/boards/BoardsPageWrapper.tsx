import { type ReactNode } from 'react'

export function BoardsPageWrapper({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-parchment">
      {children}
    </main>
  )
}
