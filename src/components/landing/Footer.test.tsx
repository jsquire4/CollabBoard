import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from './Footer'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

describe('Footer', () => {
  it('renders the Theorem brand name in the copyright line', () => {
    render(<Footer />)
    expect(screen.getByText(/theorem\. the intelligent strategy canvas/i)).toBeInTheDocument()
  })

  it('renders the current year in the copyright line', () => {
    render(<Footer />)
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument()
  })

  it('renders "Open Theorem" link pointing to /boards', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: /open theorem/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/boards')
  })

  it('renders "Sign in" link pointing to /login', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/login')
  })
})
