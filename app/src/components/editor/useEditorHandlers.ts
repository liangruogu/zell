import type { Editor } from '@tiptap/react'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { readFile } from '@tauri-apps/plugin-fs'
import { extractImagePaths } from '@/lib/clipboard'

type InsertImageFn = (dataUrl: string, sourcePath?: string) => void

interface UseEditorHandlersParams {
  editorRef: React.MutableRefObject<Editor | null>
  insertImageRef: React.MutableRefObject<InsertImageFn>
}

export function useEditorHandlers({ editorRef, insertImageRef }: UseEditorHandlersParams) {
  const toBase64 = (bytes: Uint8Array): string => {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  const handlePaste = (_view: any, event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            const reader = new FileReader()
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string
              insertImageRef.current(dataUrl)
            }
            reader.readAsDataURL(file)
            return true
          }
        }
      }
    }
    event.preventDefault()
    event.stopPropagation()
    readText().then((text) => {
      const refs = extractImagePaths(text)
      if (refs.length > 0) {
        for (const ref of refs) {
          readFile(ref.path).then((bytes) => {
            const ext = ref.path.split('.').pop()?.toLowerCase() || 'png'
            const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
            const dataUrl = `data:${mime};base64,${toBase64(bytes)}`
            insertImageRef.current(dataUrl, ref.path)
          }).catch(() => { })
        }
      } else if (text) {
        const ed = editorRef.current
        if (ed) {
          const { tr } = ed.state
          tr.insertText(text, ed.state.selection.from, ed.state.selection.to)
          ed.view.dispatch(tr)
        }
      }
    }).catch(() => { })
    return true
  }

  const handleDrop = (_view: any, event: DragEvent, _moved: boolean, _supported: boolean) => {
    const files = event.dataTransfer?.files
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string
            insertImageRef.current(dataUrl, (file as any).path)
          }
          reader.readAsDataURL(file)
          return true
        }
      }
    }
    const types = event.dataTransfer?.types || []
    let allText = ''
    for (const mimeType of types) {
      allText += (event.dataTransfer?.getData(mimeType) || '') + '\n'
    }
    const refs = extractImagePaths(allText)
    if (refs.length === 0) return false
    event.preventDefault()
    event.stopPropagation()
    const dropPos = _view.posAtCoords({ left: event.clientX, top: event.clientY })
    for (const ref of refs) {
      readFile(ref.path).then((bytes) => {
        const ext = ref.path.split('.').pop()?.toLowerCase() || 'png'
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
        const dataUrl = `data:${mime};base64,${toBase64(bytes)}`
        if (dropPos) {
          const { tr } = _view.state
          const img = _view.state.schema.nodes.image.create({ src: dataUrl })
          tr.insert(dropPos.pos, img)
          _view.dispatch(tr)
        } else {
          insertImageRef.current(dataUrl, ref.path)
        }
      }).catch(() => { })
    }
    return true
  }

  return { handlePaste, handleDrop }
}
