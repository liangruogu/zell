import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsDialog } from '@/components/share/SettingsDialog'
import { useSettingsStore } from '@/stores/settingsStore'

vi.mock('@/services/aiService', () => ({
  testProviderConnection: vi.fn().mockResolvedValue({ ok: true }),
}))

beforeEach(() => {
  vi.restoreAllMocks()
  useSettingsStore.setState({
    settings: {},
    loading: false,
  })
})

describe('SettingsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SettingsDialog open={false} onOpenChange={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('renders dialog when open', () => {
    render(<SettingsDialog open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('AI 服务')).toBeInTheDocument()
    expect(screen.getByText('外观')).toBeInTheDocument()
  })

  it('shows AI settings tab by default', () => {
    render(<SettingsDialog open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/支持任意兼容 OpenAI API 的服务/)).toBeInTheDocument()
    expect(screen.getByText('添加 Provider')).toBeInTheDocument()
    expect(screen.getByText('保存配置')).toBeInTheDocument()
  })

  it('shows no providers message', () => {
    render(<SettingsDialog open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('暂无 AI 服务，点击添加')).toBeInTheDocument()
  })

  it('switches to appearance tab', async () => {
    render(<SettingsDialog open={true} onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByText('外观'))
    expect(screen.getByText('显示编辑器工具栏')).toBeInTheDocument()
    expect(screen.getByText('打字机模式 (光标始终居中)')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    render(<SettingsDialog open={true} onOpenChange={onOpenChange} />)
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on close button click', async () => {
    const onOpenChange = vi.fn()
    render(<SettingsDialog open={true} onOpenChange={onOpenChange} />)
    const closeBtn = screen.getByRole('button', { name: '' })
    await userEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
