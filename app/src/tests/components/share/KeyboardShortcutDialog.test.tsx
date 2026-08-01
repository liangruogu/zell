import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { KeyboardShortcutDialog, useKeyboardShortcutDialog } from '@/components/share/KeyboardShortcutDialog'

const renderWithRouter = (initialEntries = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <KeyboardShortcutDialogTest />
    </MemoryRouter>
  )

function KeyboardShortcutDialogTest() {
  const { dialog } = useKeyboardShortcutDialog()
  return <div>{dialog}</div>
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('KeyboardShortcutDialog', () => {
  it('is closed by default', () => {
    renderWithRouter()
    expect(screen.queryByText('快捷键帮助')).not.toBeInTheDocument()
  })

  it('opens with Ctrl+/', async () => {
    renderWithRouter()
    await userEvent.keyboard('{Control>}/{/Control}')
    expect(screen.getByText('快捷键帮助')).toBeInTheDocument()
    expect(screen.getByText('全局')).toBeInTheDocument()
  })

  it('shows global shortcuts', async () => {
    renderWithRouter()
    await userEvent.keyboard('{Control>}/{/Control}')
    expect(screen.getByText('切换左侧面板')).toBeInTheDocument()
    expect(screen.getByText('切换 AI 面板')).toBeInTheDocument()
    expect(screen.getByText('打开/关闭快捷键帮助')).toBeInTheDocument()
  })

  it('shows knowledge shortcuts when on knowledge route', async () => {
    renderWithRouter(['/project/p1/knowledge'])
    await userEvent.keyboard('{Control>}/{/Control}')
    expect(screen.getByText('加粗')).toBeInTheDocument()
    expect(screen.getByText('知识库 — 行内格式')).toBeInTheDocument()
    expect(screen.getByText('知识库 — 块格式')).toBeInTheDocument()
    expect(screen.getByText('知识库 — 编辑器')).toBeInTheDocument()
  })

  it('shows whiteboard shortcuts when on whiteboard route', async () => {
    renderWithRouter(['/project/p1/whiteboard'])
    await userEvent.keyboard('{Control>}/{/Control}')
    expect(screen.getByText('设计画布')).toBeInTheDocument()
    expect(screen.getByText('撤销/重做')).toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    renderWithRouter()
    await userEvent.keyboard('{Control>}/{/Control}')
    expect(screen.getByText('快捷键帮助')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('快捷键帮助')).not.toBeInTheDocument()
  })
})
