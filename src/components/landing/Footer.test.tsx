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
    expect(screen.getByText(/theorem\. the intelligent strategy canvas/i)).toBeTruthy()
  })

  it('renders "Open Theorem" link pointing to /boards', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: /open theorem/i })
    expect(link.getAttribute('href')).toBe('/boards')
  })

  it('renders a copyright notice', () => {
    render(<Footer />)
    expect(screen.getByText(/intelligent strategy canvas/i)).toBeTruthy()
  })
})
