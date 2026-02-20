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
    expect(screen.getByText(/the canvas that thinks with you/i)).toBeInTheDocument()
  })

  it('renders the section subhead', () => {
    render(<Features />)
    expect(screen.getByText(/purpose-built for strategic synthesis/i)).toBeInTheDocument()
  })

  it('renders all four feature pillars', () => {
    render(<Features />)
    const cards = screen.getAllByTestId('feature-card')
    expect(cards).toHaveLength(4)
  })

  it('renders AI Board Agents pillar with description', () => {
    render(<Features />)
    expect(screen.getByText('AI Board Agents')).toBeInTheDocument()
    expect(screen.getByText(/intelligent agents analyze your canvas/i)).toBeInTheDocument()
  })

  it('renders Real-time Collaboration pillar with description', () => {
    render(<Features />)
    expect(screen.getByText('Real-time Collaboration')).toBeInTheDocument()
    expect(screen.getByText(/live cursors/i)).toBeInTheDocument()
  })

  it('renders Connected Workflows pillar with description', () => {
    render(<Features />)
    expect(screen.getByText('Connected Workflows')).toBeInTheDocument()
    expect(screen.getByText(/integrate with your existing tools/i)).toBeInTheDocument()
  })

  it('renders Structured Synthesis pillar with description', () => {
    render(<Features />)
    expect(screen.getByText('Structured Synthesis')).toBeInTheDocument()
    expect(screen.getByText(/frameworks, tables, connectors/i)).toBeInTheDocument()
  })
})
