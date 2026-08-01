import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useAIStore } from '@/stores/aiStore'
import { useSyncStore } from '@/stores/syncStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSidebarStore } from '@/stores/sidebarStore'

const renderAppShell = (initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppShell>
        <div data-testid="child-content">Page Content</div>
      </AppShell>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  useAIStore.setState({
    isOpen: false,
    sourceType: null,
    selectedText: '',
    messages: [],
    streaming: false,
    pendingInput: '',
    conversations: [],
    activeConversationId: null,
    abortController: null,
  })
  useSyncStore.setState({
    serverUrl: '',
    connected: false,
    serverRunning: false,
    displayName: '',
    readOnly: false,
  })
  useProjectStore.setState({
    projects: [],
    currentProject: null,
    loading: false,
    error: null,
  })
  useSidebarStore.setState({ collapsed: false })
})

describe('AppShell', () => {
  it('renders children content', () => {
    renderAppShell()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders sidebar', () => {
    renderAppShell()
    expect(screen.getByText('项目')).toBeInTheDocument()
  })

  it('does not show AI panel by default', () => {
    renderAppShell(['/'])
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument()
  })

  it('does not show read-only overlay when readOnly is false', () => {
    renderAppShell(['/project/p1'])
    expect(screen.queryByText('与服务器断开连接')).not.toBeInTheDocument()
  })

  it('shows read-only overlay when readOnly is true', () => {
    useSyncStore.setState({
      readOnly: true,
      serverUrl: '',
      connected: false,
      serverRunning: false,
      displayName: '',
    })
    renderAppShell(['/project/p1/knowledge'])
    expect(screen.getByText('与服务器断开连接')).toBeInTheDocument()
  })

  it('does not show read-only overlay on overview page', () => {
    useSyncStore.setState({
      readOnly: true,
      serverUrl: '',
      connected: false,
      serverRunning: false,
      displayName: '',
    })
    renderAppShell(['/project/p1'])
    expect(screen.queryByText('与服务器断开连接')).not.toBeInTheDocument()
  })
})
