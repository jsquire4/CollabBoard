import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Features } from './Features'

vi.mock('./FeatureCard', () => ({
  FeatureCard: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="feature-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}))

describe('Features', () => {
  it('renders the section heading', () => {
    render(<Features />)
    expect(screen.getByText(/the canvas that thinks with you/i)).toBeTruthy()
  })

  it('renders the section subhead', () => {
    render(<Features />)
    expect(screen.getByText(/purpose-built for strategic synthesis/i)).toBeTruthy()
  })

  it('renders all four feature pillars', () => {
    render(<Features />)
    const cards = screen.getAllByTestId('feature-card')
    expect(cards).toHaveLength(4)
  })

  it('renders AI Board Agents pillar', () => {
    render(<Features />)
    expect(screen.getByText('AI Board Agents')).toBeTruthy()
  })

  it('renders Real-time Collaboration pillar', () => {
    render(<Features />)
    expect(screen.getByText('Real-time Collaboration')).toBeTruthy()
  })

  it('renders Connected Workflows pillar', () => {
    render(<Features />)
    expect(screen.getByText('Connected Workflows')).toBeTruthy()
  })

  it('renders Structured Synthesis pillar', () => {
    render(<Features />)
    expect(screen.getByText('Structured Synthesis')).toBeTruthy()
  })
})
