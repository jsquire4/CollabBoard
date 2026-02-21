import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockSignInWithOAuth = vi.fn(() => Promise.resolve({ data: null, error: null }))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSignInWithPassword = vi.fn((): Promise<any> => Promise.resolve({ data: null, error: null }))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSignUp = vi.fn((): Promise<any> => Promise.resolve({ data: null, error: null }))
const mockSupabase = {
  auth: {
    signInWithOAuth: mockSignInWithOAuth,
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
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
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}))

import { LoginContent } from './LoginContent'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoginContent', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockSignInWithOAuth.mockClear()
    mockSignInWithPassword.mockClear()
    mockSignUp.mockClear()
    mockPush.mockClear()
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
    expect(screen.getByText(/sign in to start building/i)).toBeInTheDocument()
  })

  it('renders the terms of service note', () => {
    render(<LoginContent />)
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument()
  })

  // ── Email/password form tests ──────────────────────────────────────────

  it('renders email and password inputs', () => {
    render(<LoginContent />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders the "or" divider between Google button and email form', () => {
    render(<LoginContent />)
    expect(screen.getByText('or')).toBeInTheDocument()
  })

  it('renders sign-in submit button by default', () => {
    render(<LoginContent />)
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('toggles to sign-up mode when "Sign up" link is clicked', async () => {
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
  })

  it('calls signInWithPassword on sign-in submit and redirects to /boards', async () => {
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
    expect(mockPush).toHaveBeenCalledWith('/boards')
  })

  it('calls signUp on sign-up submit and redirects to /boards', async () => {
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
    })
    expect(mockPush).toHaveBeenCalledWith('/boards')
  })

  it('shows inline error when signInWithPassword fails', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials' },
    })
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows inline error when signUp fails', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { message: 'User already registered' },
    })
    const user = userEvent.setup()
    render(<LoginContent />)
    await user.click(screen.getByRole('button', { name: /sign up/i }))
    await user.type(screen.getByLabelText(/email/i), 'exists@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText('User already registered')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
