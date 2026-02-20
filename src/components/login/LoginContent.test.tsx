import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockSignInWithOAuth = vi.fn(() => Promise.resolve({ data: null, error: null }))
const mockSupabase = {
  auth: {
    signInWithOAuth: mockSignInWithOAuth,
  },
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/components/login/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>Sign in with Google</button>
  ),
}))

let mockSearchParams: URLSearchParams

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

import { LoginContent } from './LoginContent'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoginContent', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockSignInWithOAuth.mockClear()
  })

  it('renders the "Welcome to Theorem" heading', () => {
    render(<LoginContent />)
    expect(screen.getByRole('heading', { name: /welcome to theorem/i })).toBeInTheDocument()
  })

  it('renders both Theorem wordmarks (desktop left panel + mobile)', () => {
    render(<LoginContent />)
    const wordmarks = screen.getAllByText('Theorem')
    expect(wordmarks).toHaveLength(2)
  })

  it('renders left-panel tagline', () => {
    render(<LoginContent />)
    expect(screen.getByText(/every position begins with a question/i)).toBeInTheDocument()
  })

  it('renders a "Back to home" link pointing to /', () => {
    render(<LoginContent />)
    const link = screen.getByRole('link', { name: /back to home/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders the Google sign-in button', () => {
    render(<LoginContent />)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('calls supabase.auth.signInWithOAuth with google provider and callback path on button click', async () => {
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/callback'),
        }),
      })
    )
  })

  it('does not show auth error banner when no error param', () => {
    render(<LoginContent />)
    expect(screen.queryByText(/authentication failed/i)).not.toBeInTheDocument()
  })

  it('shows auth error banner with role="alert" when error param is present', () => {
    mockSearchParams = new URLSearchParams({ error: 'access_denied' })
    render(<LoginContent />)
    const banner = screen.getByText(/authentication failed/i)
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('role', 'alert')
  })

  it('renders the sign-in subtext', () => {
    render(<LoginContent />)
    expect(screen.getByText(/sign in with your google account/i)).toBeInTheDocument()
  })

  it('renders the terms of service note', () => {
    render(<LoginContent />)
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument()
  })
})
