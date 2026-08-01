import { useEffect } from 'react'

interface UseKnowledgeShortcutsOptions {
  panel: { toggle: () => void }
  setListTab: (tab: 'files' | 'outline') => void
  focusSearch: () => void
  showSearch: boolean
  setShowSearch: (v: boolean) => void
  setSearchQuery: (v: string) => void
}

export function useKnowledgeShortcuts(o: UseKnowledgeShortcutsOptions) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        o.panel.toggle()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        o.setListTab('files')
        o.setShowSearch(true)
        o.focusSearch()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'f') {
        const active = document.activeElement
        if (!active?.closest('.ProseMirror') && !active?.closest('[contenteditable]')) {
          e.preventDefault()
          o.setListTab('files')
          o.setShowSearch(true)
          o.focusSearch()
        }
      }
      if (e.key === 'Escape' && o.showSearch) {
        o.setShowSearch(false)
        o.setSearchQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [o.showSearch, o.panel, o.setListTab, o.setShowSearch, o.setSearchQuery, o.focusSearch])
}
