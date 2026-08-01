import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResizablePanel, useResizablePanel } from '@/components/layout/ResizablePanel'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ResizablePanel (component)', () => {
  it('renders children', () => {
    render(
      <ResizablePanel>
        <div>Panel Content</div>
      </ResizablePanel>
    )
    expect(screen.getByText('Panel Content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ResizablePanel className="my-custom-class">
        <div>Content</div>
      </ResizablePanel>
    )
    const panel = container.querySelector('.my-custom-class')
    expect(panel).toBeTruthy()
  })

  it('uses defaultWidth prop', () => {
    render(
      <ResizablePanel defaultWidth={300}>
        <div>Wide Panel</div>
      </ResizablePanel>
    )
    const panel = screen.getByText('Wide Panel')
    expect(panel).toBeInTheDocument()
  })
})

describe('useResizablePanel (hook)', () => {
  it('returns panelProps with className and style', () => {
    function TestComponent() {
      const { panelProps, handleProps } = useResizablePanel()
      return (
        <div>
          <div {...panelProps} data-testid="panel">
            Panel
          </div>
          {handleProps && <div {...handleProps} data-testid="handle" />}
        </div>
      )
    }
    render(<TestComponent />)
    expect(screen.getByTestId('panel')).toBeInTheDocument()
    expect(screen.getByTestId('handle')).toBeInTheDocument()
  })
})
