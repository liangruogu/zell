import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Card } from '@/components/ui/Card'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello World</Card>)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<Card className="custom">Content</Card>)
    const card = screen.getByText('Content')
    expect(card.className).toContain('custom')
  })

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>Clickable</Card>)
    await userEvent.click(screen.getByText('Clickable'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders without onClick', () => {
    render(<Card>No Click</Card>)
    expect(screen.getByText('No Click')).toBeInTheDocument()
  })

  it('has default card styles', () => {
    render(<Card>Styled</Card>)
    const card = screen.getByText('Styled')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('shadow-sm')
  })
})
