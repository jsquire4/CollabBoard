import { type ReactNode } from 'react'

export function BoardsPageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-parchment">
      {children}
    </div>
  )
}
