import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { InviteDialog } from '@/components/share/InviteDialog'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types/project'

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test Project',
  description: '',
  background: '',
  settings: '{"inviteCode":"BNDL-1234","serverUrl":"http://localhost:3000","token":"tok"}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

const renderDialog = (open = true, onOpenChange = vi.fn(), projectId = 'proj-1') =>
  render(
    <MemoryRouter>
      <InviteDialog open={open} onOpenChange={onOpenChange} projectId={projectId} />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.restoreAllMocks()
  useProjectStore.setState({
    projects: [],
    currentProject: mockProject,
    loading: false,
    error: null,
  })
})

describe('InviteDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderDialog(false)
    expect(container.textContent).toBe('')
  })

  it('renders dialog when open', () => {
    renderDialog()
    expect(screen.getByText('团队协作')).toBeInTheDocument()
    expect(screen.getByText('分享邀请码，团队成员可直接加入')).toBeInTheDocument()
  })

  it('shows invite code when available', () => {
    renderDialog()
    expect(screen.getByText('BNDL-1234')).toBeInTheDocument()
    expect(screen.getByText('邀请码')).toBeInTheDocument()
  })

  it('shows copy button', () => {
    renderDialog()
    expect(screen.getByText('复制')).toBeInTheDocument()
  })

  it('shows join section', () => {
    renderDialog()
    expect(screen.getByText('加入已有项目')).toBeInTheDocument()
  })

  it('does not show invite code section when no invite code', () => {
    const noCode = { ...mockProject, settings: '{"serverUrl":"http://localhost:3000"}' }
    useProjectStore.setState({
      projects: [],
      currentProject: noCode,
      loading: false,
      error: null,
    })
    renderDialog()
    expect(screen.queryByText('邀请码')).not.toBeInTheDocument()
  })

  it('toggles join form visibility', async () => {
    renderDialog()
    await userEvent.click(screen.getByText('加入已有项目'))
    expect(screen.getByPlaceholderText('输入邀请码 BNDL-xxxx...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('你的显示名称')).toBeInTheDocument()
  })
})
