import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublishSettings } from '@/components/project/PublishSettings'
import { useProjectStore } from '@/stores/projectStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useSyncStore } from '@/stores/syncStore'
import type { Project } from '@/types/project'
import type { KnowledgeArticle } from '@/types/knowledge'
import type { Whiteboard } from '@/types/whiteboard'

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test',
  description: '',
  background: '',
  settings: '{"publish":{"enabled":true,"wiki":[],"ppt":[],"ui":[],"mood":[]}}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

const mockArticles: KnowledgeArticle[] = [
  { id: 'a1', title: 'Article 1', project_id: 'proj-1', content: '', content_json: '', sort_order: 0, created_at: '', updated_at: '', deleted_at: null, parent_id: null },
]

const mockWhiteboards: Whiteboard[] = [
  { id: 'wb1', name: 'WB 1', project_id: 'proj-1', wb_type: 'ppt', snapshot: '{}', created_at: '', updated_at: '', deleted_at: null, update_log: null },
]

beforeEach(() => {
  vi.restoreAllMocks()
  useKnowledgeStore.setState({
    articles: mockArticles,
    currentArticle: null,
    loading: false,
    fetchArticles: vi.fn(),
  } as any)
  useWhiteboardStore.setState({
    whiteboards: mockWhiteboards,
    currentWhiteboard: null,
    loading: false,
    fetchWhiteboards: vi.fn(),
  } as any)
  useProjectStore.setState({
    projects: [],
    currentProject: mockProject,
    loading: false,
    error: null,
    updateProject: vi.fn().mockResolvedValue(undefined),
  } as any)
  useSyncStore.setState({
    serverUrl: 'http://localhost:3000',
    connected: true,
    serverRunning: false,
    displayName: '',
    readOnly: false,
    notifications: null,
  })
})

describe('PublishSettings', () => {
  it('renders publish toggle header', () => {
    render(<PublishSettings />)
    expect(screen.getByText('网站部署')).toBeInTheDocument()
    expect(screen.getByText('开启后将选中内容发布为可公开访问的网页')).toBeInTheDocument()
  })

  it('renders publish URL when enabled and connected', () => {
    render(<PublishSettings />)
    expect(screen.getByText('访问地址：')).toBeInTheDocument()
  })

  it('renders categories', () => {
    render(<PublishSettings />)
    expect(screen.getByText('知识库')).toBeInTheDocument()
    expect(screen.getByText('PPT')).toBeInTheDocument()
    expect(screen.getByText('UI')).toBeInTheDocument()
    expect(screen.getByText('Mood')).toBeInTheDocument()
  })

  it('shows disconnected message when not connected', () => {
    useSyncStore.setState({
      serverUrl: 'http://localhost:3000',
      connected: false,
      serverRunning: false,
      displayName: '',
      readOnly: false,
      notifications: null,
    })
    render(<PublishSettings />)
    expect(screen.getByText('发布功能需连接协作服务器')).toBeInTheDocument()
  })
})
