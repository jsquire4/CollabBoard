import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

describe('Hero', () => {
  it('renders the Theorem headline', () => {
    render(<Hero isAuthenticated={false} />)
    expect(screen.getByText(/where hypotheses become theorems/i)).toBeInTheDocument()
  })

  it('renders the subhead copy', () => {
    render(<Hero isAuthenticated={false} />)
    expect(screen.getByText(/intelligent strategy canvas/i)).toBeInTheDocument()
  })

  describe('unauthenticated state', () => {
    it('renders "Start thinking" CTA linking to /login', () => {
      render(<Hero isAuthenticated={false} />)
      const link = screen.getByRole('link', { name: /start thinking/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/login')
    })

    it('renders "See it in action" CTA linking to #features', () => {
      render(<Hero isAuthenticated={false} />)
      const link = screen.getByRole('link', { name: /see it in action/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '#features')
    })

    it('does not render "Open Theorem" CTA', () => {
      render(<Hero isAuthenticated={false} />)
      expect(screen.queryByRole('link', { name: /open theorem/i })).not.toBeInTheDocument()
    })
  })

  describe('authenticated state', () => {
    it('renders "Open Theorem" CTA linking to /boards', () => {
      render(<Hero isAuthenticated={true} />)
      const link = screen.getByRole('link', { name: /open theorem/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/boards')
    })

    it('does not render "Start thinking" CTA', () => {
      render(<Hero isAuthenticated={true} />)
      expect(screen.queryByRole('link', { name: /start thinking/i })).not.toBeInTheDocument()
    })

    it('does not render "See it in action" CTA', () => {
      render(<Hero isAuthenticated={true} />)
      expect(screen.queryByRole('link', { name: /see it in action/i })).not.toBeInTheDocument()
    })
  })

  it('renders the badge with Theorem capability copy', () => {
    render(<Hero isAuthenticated={false} />)
    expect(screen.getByText(/intelligent canvas · real-time · ai-powered/i)).toBeInTheDocument()
  })
})
