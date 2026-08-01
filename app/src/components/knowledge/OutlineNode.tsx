import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HeadingNode } from '@/lib/headingTree'

interface OutlineNodeProps {
  node: HeadingNode
  depth: number
}

export function OutlineNode({ node, depth }: OutlineNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  const scrollToHeading = () => {
    const editor = document.querySelector('.ProseMirror')
    if (!editor) return
    const all = editor.querySelectorAll(`h${node.level}`)
    if (all.length > 0) {
      for (const el of all) {
        if (el.textContent?.trim() === node.text) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }
      all[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-0.5 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 transition-colors select-none',
          depth === 0 && 'font-medium py-0.5',
          depth >= 1 && 'py-0.5',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={scrollToHeading}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="p-0.5 rounded hover:bg-gray-200 shrink-0"
          >
            <ChevronRight
              size={12}
              className={cn('text-gray-400 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <span className="truncate">{node.text}</span>
      </div>
      {expanded && hasChildren && node.children.map((child, i) => (
        <OutlineNode key={i} node={child} depth={depth + 1} />
      ))}
    </>
  )
}
