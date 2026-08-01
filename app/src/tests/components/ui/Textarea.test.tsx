import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from '@/components/ui/Textarea'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea placeholder="Enter description" />)
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
  })

  it('renders a label when provided', () => {
    render(<Textarea id="desc" label="Description" />)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('renders an error message when provided', () => {
    render(<Textarea error="Too long" />)
    expect(screen.getByText('Too long')).toBeInTheDocument()
  })

  it('applies error styles to textarea', () => {
    render(<Textarea error="Error" />)
    const textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('border-red-400')
  })

  it('supports onChange events', async () => {
    const onChange = vi.fn()
    render(<Textarea onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('can be disabled', () => {
    render(<Textarea disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('supports rows attribute', () => {
    render(<Textarea rows={5} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5')
  })

  it('applies custom className', () => {
    render(<Textarea className="custom-area" />)
    expect(screen.getByRole('textbox').className).toContain('custom-area')
  })
})
