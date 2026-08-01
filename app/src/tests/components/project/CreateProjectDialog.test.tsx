import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'
import { useProjectStore } from '@/stores/projectStore'
import { invoke } from '@tauri-apps/api/core'
import type { Project } from '@/types/project'

const mockCreated: Project = {
  id: 'new-123',
  name: 'New Project',
  description: '',
  background: '',
  settings: '{}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

const renderDialog = (open = true, onOpenChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <CreateProjectDialog open={open} onOpenChange={onOpenChange} />
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
})

describe('CreateProjectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderDialog(false)
    expect(container.querySelector('.fixed')).toBeNull()
  })

  it('renders dialog content when open', () => {
    renderDialog()
    expect(screen.getByText('新建项目')).toBeInTheDocument()
    expect(screen.getByText('创建一个新项目，填写基本信息后将自动建立 AI 上下文索引。')).toBeInTheDocument()
  })

  it('renders form fields', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('输入项目名称')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('简要描述项目内容')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('详细描述项目背景信息，将作为 AI 上下文自动注入')).toBeInTheDocument()
  })

  it('create button is disabled when name is empty', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: '创建项目' })).toBeDisabled()
  })

  it('create button is enabled when name is filled', async () => {
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText('输入项目名称'), 'My Project')
    expect(screen.getByRole('button', { name: '创建项目' })).not.toBeDisabled()
  })

  it('calls createProject on submit', async () => {
    vi.mocked(invoke).mockResolvedValue(mockCreated)
    const mockCreateProject = vi.fn().mockResolvedValue(mockCreated)
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
      error: null,
      createProject: mockCreateProject,
    } as any)
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText('输入项目名称'), 'My Project{Enter}')
    await vi.waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledTimes(1)
    })
  })
})
