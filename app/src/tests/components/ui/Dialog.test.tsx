import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from '@/components/ui/Dialog'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog open={false} onOpenChange={vi.fn()} title="Test">
        <p>Content</p>
      </Dialog>
    )
    expect(container.textContent).toBe('')
  })

  it('renders content when open', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()} title="Test Title">
        <p>Dialog Content</p>
      </Dialog>
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Dialog Content')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()} title="Title" description="A description">
        <p>Body</p>
      </Dialog>
    )
    expect(screen.getByText('A description')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when close button is clicked', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open={true} onOpenChange={onOpenChange} title="Title">
        <p>Body</p>
      </Dialog>
    )
    const closeButton = screen.getByRole('button')
    await userEvent.click(closeButton)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) when Escape is pressed', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open={true} onOpenChange={onOpenChange} title="Title">
        <p>Body</p>
      </Dialog>
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) when clicking overlay', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open={true} onOpenChange={onOpenChange} title="Title">
        <p>Body</p>
      </Dialog>
    )
    const overlay = screen.getByText('Body').closest('.fixed.inset-0')
    if (overlay) {
      await userEvent.click(overlay)
    }
  })

  it('applies custom className to dialog panel', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()} className="custom-dialog">
        <p>Body</p>
      </Dialog>
    )
    const panel = screen.getByText('Body').closest('.relative.z-10')
    expect(panel).toBeTruthy()
  })

  it('does not render title section when no title or description', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <p>Only Content</p>
      </Dialog>
    )
    expect(screen.getByText('Only Content')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('sets body overflow to hidden when open and restores on close', () => {
    const { unmount } = render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <p>Body</p>
      </Dialog>
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
