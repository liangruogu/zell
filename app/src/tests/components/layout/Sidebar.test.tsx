import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { useProjectStore } from '@/stores/projectStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import type { Project } from '@/types/project'

const mockProject: Project = {
  id: 'p1',
  name: 'Test Project',
  description: 'desc',
  background: '',
  settings: '{}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

const renderSidebar = (initialEntries = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.restoreAllMocks()
  useProjectStore.setState({
    projects: [],
    currentProject: null,
    loading: false,
    error: null,
  })
  useSidebarStore.setState({ collapsed: false })
})

describe('Sidebar', () => {
  it('renders project navigation link', () => {
    renderSidebar()
    expect(screen.getByText('项目')).toBeInTheDocument()
  })

  it('renders create project button', () => {
    renderSidebar()
    expect(screen.getByText('新建项目')).toBeInTheDocument()
  })

  it('renders settings button', () => {
    renderSidebar()
    expect(screen.getByText('设置')).toBeInTheDocument()
  })

  it('shows collapsed state', () => {
    useSidebarStore.setState({ collapsed: true })
    renderSidebar()
    expect(screen.queryByText('新建项目')).not.toBeInTheDocument()
    expect(screen.queryByText('设置')).not.toBeInTheDocument()
  })

  it('shows project nav items when on a project route and currentProject is set', () => {
    useProjectStore.setState({ currentProject: mockProject })
    renderSidebar(['/project/p1'])
    expect(screen.getByText('概览')).toBeInTheDocument()
    expect(screen.getByText('知识库')).toBeInTheDocument()
    expect(screen.getByText('设计画布')).toBeInTheDocument()
    expect(screen.getByText('外部资源')).toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('does not show project nav items when on root route', () => {
    useProjectStore.setState({ currentProject: mockProject })
    renderSidebar(['/'])
    expect(screen.queryByText('概览')).not.toBeInTheDocument()
  })

  it('toggle button is rendered', () => {
    renderSidebar()
    expect(screen.getByTitle('收起侧边栏')).toBeInTheDocument()
  })

  it('shows expand title when collapsed', () => {
    useSidebarStore.setState({ collapsed: true })
    renderSidebar()
    expect(screen.getByTitle('展开侧边栏')).toBeInTheDocument()
  })
})
