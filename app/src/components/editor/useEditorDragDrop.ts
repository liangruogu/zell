import { logger } from '@/lib/logger'
import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { readFile } from '@tauri-apps/plugin-fs'

type InsertImageFn = (dataUrl: string, sourcePath?: string) => void

interface UseEditorDragDropParams {
  editorRef: React.MutableRefObject<Editor | null>
  insertImage: InsertImageFn
}

export function useEditorDragDrop({ editorRef, insertImage }: UseEditorDragDropParams) {

  useEffect(() => {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
    const toBase64 = (bytes: Uint8Array): string => {
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return btoa(binary)
    }
    let mouseX = 0, mouseY = 0
    const onMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY }

    const promise = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'enter') {
        window.addEventListener('mousemove', onMouseMove)
        const ed = editorRef.current
        if (ed) ed.view.dom.classList.add('drag-over')
      }
      if (event.payload.type === 'over') {
        const ed = editorRef.current
        if (!ed) return
        const rect = ed.view.dom.getBoundingClientRect()
        const pos = ed.view.posAtCoords({ left: mouseX - rect.left, top: mouseY - rect.top })
        if (pos) ed.chain().focus().setTextSelection(pos.pos).run()
      }
      if (event.payload.type === 'leave' || event.payload.type === 'drop') {
        window.removeEventListener('mousemove', onMouseMove)
        editorRef.current?.view.dom.classList.remove('drag-over')
      }
      if (event.payload.type !== 'drop') return
      for (const filePath of event.payload.paths) {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        if (!imageExts.includes(ext)) continue
        readFile(filePath).then((bytes) => {
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
          const base64 = toBase64(bytes)
          const dataUrl = `data:${mime};base64,${base64}`
          insertImage(dataUrl, filePath)
        }).catch((e) => { logger.error('useEditorDragDrop: failed to read dropped image file', e) })
      }
    })
    return () => { promise.then((fn) => fn()) }
  }, [insertImage])
}
