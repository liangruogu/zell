import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectForm } from '@/components/project/ProjectForm'
import type { Project } from '@/types/project'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ProjectForm', () => {
  it('renders form fields', () => {
    render(<ProjectForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('项目名称 *')).toBeInTheDocument()
    expect(screen.getByLabelText('图标')).toBeInTheDocument()
    expect(screen.getByLabelText('项目描述')).toBeInTheDocument()
    expect(screen.getByLabelText('项目背景')).toBeInTheDocument()
  })

  it('renders submit button with default label', () => {
    render(<ProjectForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('renders submit button with custom label', () => {
    render(<ProjectForm onSubmit={vi.fn()} submitLabel="创建" />)
    expect(screen.getByRole('button', { name: '创建' })).toBeInTheDocument()
  })

  it('populates default values', () => {
    const defaults: Partial<Project> = {
      name: 'Existing Project',
      description: 'Existing description',
    }
    render(<ProjectForm onSubmit={vi.fn()} defaultValues={defaults} />)
    expect(screen.getByDisplayValue('Existing Project')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument()
  })

  it('shows validation error when submitting empty name', async () => {
    const onSubmit = vi.fn()
    render(<ProjectForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(screen.getByText('项目名称不能为空')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with form data when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProjectForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('项目名称 *'), 'New Project')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    const callArgs = onSubmit.mock.calls[0][0]
    expect(callArgs).toMatchObject({
      name: 'New Project',
      description: '',
      background: '',
      icon: '',
    })
  })
})
