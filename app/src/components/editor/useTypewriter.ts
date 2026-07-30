import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'

interface UseTypewriterParams {
  editor: Editor | null
  enabled: boolean
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function useTypewriter({ editor, enabled, scrollRef }: UseTypewriterParams) {

  useEffect(() => {
    if (!enabled || !editor) return
    const container = scrollRef.current
    if (!container) return
    const onSelectionUpdate = () => {
      const { head } = editor.state.selection
      const coords = editor.view.coordsAtPos(head)
      if (!coords) return
      const cursorY = coords.top - container.getBoundingClientRect().top + container.scrollTop
      const target = cursorY - container.clientHeight / 2
      const maxScroll = container.scrollHeight - container.clientHeight
      container.scrollTo({ top: Math.max(0, Math.min(maxScroll, target)), behavior: 'smooth' })
    }
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => { editor.off('selectionUpdate', onSelectionUpdate) }
  }, [enabled, editor])
}
