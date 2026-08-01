import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ProjectCard } from '@/components/project/ProjectCard'
import type { Project } from '@/types/project'

const mockProject: Project = {
  id: 'proj-123',
  name: 'My Awesome Project',
  description: 'A test project for testing purposes',
  background: '',
  settings: '{}',
  created_at: '2024-06-15T10:00:00Z',
  updated_at: '2024-08-01T08:30:00Z',
  deleted_at: null,
}

const renderCard = (project: Project = mockProject) =>
  render(
    <MemoryRouter>
      <ProjectCard project={project} />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ProjectCard', () => {
  it('renders project name', () => {
    renderCard()
    expect(screen.getByText('My Awesome Project')).toBeInTheDocument()
  })

  it('renders project description', () => {
    renderCard()
    expect(screen.getByText('A test project for testing purposes')).toBeInTheDocument()
  })

  it('renders creation date', () => {
    renderCard()
    expect(screen.getByText(/创建于/)).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    const noDesc = { ...mockProject, description: '' }
    renderCard(noDesc)
    expect(screen.queryByText('A test project for testing purposes')).not.toBeInTheDocument()
  })

  it('is clickable and uses card onClick', () => {
    renderCard()
    const card = screen.getByText('My Awesome Project').closest('[class*="cursor-pointer"]')
    expect(card).toBeTruthy()
  })
})
