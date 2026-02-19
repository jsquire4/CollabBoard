import { Suspense } from 'react'
import { LoginContent } from '@/components/login/LoginContent'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
