import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useFileStore } from '@/stores/fileStore'
import type { ProjectFile } from '@/types/share'

const mockFile: ProjectFile = {
  id: 'f1',
  project_id: 'p1',
  file_name: 'test.pdf',
  original_name: 'test.pdf',
  file_type: 'pdf',
  file_size: 1024,
  extracted_text: '',
  description: '',
  sort_order: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useFileStore.setState({
    files: [],
    currentFile: null,
    loading: false,
  })
})

describe('fileStore', () => {
  describe('fetchFiles', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue([mockFile])

      await useFileStore.getState().fetchFiles('p1')

      expect(invoke).toHaveBeenCalledWith('get_project_files', { projectId: 'p1' })
      expect(useFileStore.getState().files).toHaveLength(1)
      expect(useFileStore.getState().loading).toBe(false)
    })

    it('sets loading true while fetching', () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))
      useFileStore.getState().fetchFiles('p1')
      expect(useFileStore.getState().loading).toBe(true)
    })

    it('handles error gracefully', async () => {
      vi.mocked(invoke).mockRejectedValue('Error')
      await useFileStore.getState().fetchFiles('p1')
      expect(useFileStore.getState().loading).toBe(false)
    })
  })

  describe('importFile', () => {
    it('calls invoke and appends to list', async () => {
      vi.mocked(invoke).mockResolvedValue(mockFile)

      const result = await useFileStore.getState().importFile('p1', '/path/to/file.pdf')

      expect(invoke).toHaveBeenCalledWith('import_project_file', {
        projectId: 'p1',
        sourcePath: '/path/to/file.pdf',
      })
      expect(useFileStore.getState().files).toHaveLength(1)
      expect(result.id).toBe('f1')
    })
  })

  describe('deleteFile', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useFileStore.setState({
        files: [mockFile],
        currentFile: mockFile,
      })

      await useFileStore.getState().deleteFile('f1')

      expect(invoke).toHaveBeenCalledWith('delete_project_file', { id: 'f1' })
      expect(useFileStore.getState().files).toHaveLength(0)
      expect(useFileStore.getState().currentFile).toBeNull()
    })
  })

  describe('updateFile', () => {
    it('calls invoke and updates description in state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useFileStore.setState({ files: [mockFile] })

      await useFileStore.getState().updateFile('f1', { description: 'new desc' })

      expect(invoke).toHaveBeenCalledWith('update_project_file', {
        id: 'f1',
        description: 'new desc',
      })
      expect(useFileStore.getState().files[0].description).toBe('new desc')
    })
  })

  describe('resolveFileUrl', () => {
    it('calls invoke and returns url', async () => {
      vi.mocked(invoke).mockResolvedValue('asset://test.pdf')

      const url = await useFileStore.getState().resolveFileUrl('p1', 'test.pdf')

      expect(invoke).toHaveBeenCalledWith('resolve_project_file', {
        projectId: 'p1',
        fileName: 'test.pdf',
      })
      expect(url).toBe('asset://test.pdf')
    })
  })

  describe('getFilePath', () => {
    it('calls invoke and returns path', async () => {
      vi.mocked(invoke).mockResolvedValue('/data/test.pdf')

      const path = await useFileStore.getState().getFilePath('p1', 'test.pdf')

      expect(invoke).toHaveBeenCalledWith('get_project_file_path', {
        projectId: 'p1',
        fileName: 'test.pdf',
      })
      expect(path).toBe('/data/test.pdf')
    })
  })

  describe('reExtractText', () => {
    it('calls invoke and updates extracted text', async () => {
      vi.mocked(invoke).mockResolvedValue('extracted content')
      useFileStore.setState({
        files: [mockFile],
        currentFile: mockFile,
      })

      const text = await useFileStore.getState().reExtractText('f1')

      expect(invoke).toHaveBeenCalledWith('re_extract_file_text', { id: 'f1' })
      expect(useFileStore.getState().files[0].extracted_text).toBe('extracted content')
      expect(useFileStore.getState().currentFile?.extracted_text).toBe('extracted content')
      expect(text).toBe('extracted content')
    })
  })

  describe('setCurrentFile', () => {
    it('sets currentFile directly', () => {
      useFileStore.getState().setCurrentFile(mockFile)
      expect(useFileStore.getState().currentFile?.id).toBe('f1')
    })

    it('sets currentFile to null', () => {
      useFileStore.getState().setCurrentFile(mockFile)
      useFileStore.getState().setCurrentFile(null)
      expect(useFileStore.getState().currentFile).toBeNull()
    })
  })

  describe('renameFile', () => {
    it('calls invoke and updates name in state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useFileStore.setState({
        files: [mockFile],
        currentFile: mockFile,
      })

      await useFileStore.getState().renameFile('f1', 'renamed.pdf')

      expect(invoke).toHaveBeenCalledWith('rename_project_file', {
        id: 'f1',
        newName: 'renamed.pdf',
      })
      expect(useFileStore.getState().files[0].original_name).toBe('renamed.pdf')
      expect(useFileStore.getState().currentFile?.original_name).toBe('renamed.pdf')
    })
  })
})
