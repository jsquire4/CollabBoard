import { Suspense } from 'react'
import { ResetPasswordContent } from '@/components/login/ResetPasswordContent'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-parchment">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-parchment-border border-t-navy" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
