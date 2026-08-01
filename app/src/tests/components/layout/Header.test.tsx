import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Header } from '@/components/layout/Header'

const renderWithRouter = (ui: React.ReactElement, initialEntries = ['/']) =>
  render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Header', () => {
  it('renders title', () => {
    renderWithRouter(<Header title="Projects" />)
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    renderWithRouter(<Header title="Project" subtitle="Overview" />)
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
  })

  it('renders back button when backTo is provided', () => {
    renderWithRouter(<Header title="Detail" backTo="/home" />)
    expect(screen.getByTitle('返回')).toBeInTheDocument()
  })

  it('does not render back button when backTo is not provided', () => {
    renderWithRouter(<Header title="Home" />)
    expect(screen.queryByTitle('返回')).not.toBeInTheDocument()
  })

  it('renders actions when provided', () => {
    renderWithRouter(
      <Header title="Page" actions={<button>Save</button>} />
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('does not render actions div when no actions', () => {
    renderWithRouter(<Header title="Page" />)
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })
})
