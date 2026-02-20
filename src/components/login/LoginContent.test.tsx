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
    expect(screen.getByRole('heading', { name: /welcome to theorem/i })).toBeTruthy()
  })

  it('renders the Theorem wordmark', () => {
    render(<LoginContent />)
    // Two instances: left panel (desktop) + mobile-only
    const wordmarks = screen.getAllByText('Theorem')
    expect(wordmarks.length).toBeGreaterThanOrEqual(1)
  })

  it('renders left-panel tagline', () => {
    render(<LoginContent />)
    expect(screen.getByText(/every position begins with a question/i)).toBeTruthy()
  })

  it('renders a "Back to home" link pointing to /', () => {
    render(<LoginContent />)
    const link = screen.getByRole('link', { name: /back to home/i })
    expect(link.getAttribute('href')).toBe('/')
  })

  it('renders the Google sign-in button', () => {
    render(<LoginContent />)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeTruthy()
  })

  it('calls supabase.auth.signInWithOAuth with google provider on button click', async () => {
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )
  })

  it('does not show auth error banner when no error param', () => {
    render(<LoginContent />)
    expect(screen.queryByText(/authentication failed/i)).toBeNull()
  })

  it('shows auth error banner when error param is present', () => {
    mockSearchParams = new URLSearchParams({ error: 'access_denied' })
    render(<LoginContent />)
    expect(screen.getByText(/authentication failed/i)).toBeTruthy()
  })

  it('renders the terms of service note', () => {
    render(<LoginContent />)
    expect(screen.getByText(/terms of service/i)).toBeTruthy()
  })
})
