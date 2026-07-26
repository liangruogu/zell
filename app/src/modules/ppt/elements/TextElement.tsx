import { useState, useCallback, useMemo, memo } from 'react'
import { useDrag, shadowStyle, type EP, type ElementConfig } from './utils'
import { usePptStore } from '../store'
import { RichTextEditor, renderRichTextHTML } from './RichTextEditor'

function defaultContent(text: string): any {
  return { type: 'doc', content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [{ type: 'paragraph' }] }
}

const TextHTML = memo(function TextHTML({ html }: { html: string }) {
  return <div className="tl-rich-text" dangerouslySetInnerHTML={{ __html: html }} style={{ padding: 0, margin: 0, overflow: 'hidden' }} />
}, (prev, next) => prev.html === next.html)

export function TextEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const ss = shadowStyle(el.props)
  const p = el.props
  const [editing, setEditing] = useState(false)
  const content = p.content || defaultContent(p.text || '')
  const fontSize = p.fontSize || 16
  const html = useMemo(() => renderRichTextHTML(content), [content])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.detail === 2) { e.preventDefault(); e.stopPropagation(); setEditing(true) }
  }, [])

  const saveContent = useCallback((json: any) => {
    setEditing(false)
    const s = usePptStore.getState()
    if (!s.currentSlideId) return
    const isEmpty = !json.content || json.content.length === 0
      || (json.content.length === 1 && json.content[0].type === 'paragraph'
        && (!json.content[0].content || json.content[0].content.length === 0))
    if (isEmpty) {
      s.deleteElements(s.currentSlideId, [el.id])
    } else {
      s.updateElement(s.currentSlideId, el.id, { props: { ...el.props, content: json } })
    }
  }, [el.id, el.props])

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: el.x, top: el.y,
    width: el.w, height: el.h,
    opacity: el.opacity,
    fontSize: fontSize + 'px',
    color: p.fontColor || '#333',
    fontFamily: p.fontFamily || 'inherit',
    fontWeight: p.fontWeight || 'normal',
    fontStyle: p.fontStyle || 'normal',
    textDecoration: p.textDecoration || 'none',
    lineHeight: p.lineHeight || 1.5,
    textAlign: (p.textAlign || 'left') as any,
    letterSpacing: (p.letterSpacing || 0) + 'px',
    overflow: 'hidden',
    overflowWrap: 'break-word', wordBreak: 'break-word' as any,
    padding: '2px 4px',
    boxShadow: ss,
    outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined,
    outlineOffset: '1px',
    cursor: editing ? 'text' : dragging ? 'grabbing' : 'default',
    userSelect: editing ? 'text' : 'none',
  }

  return (
    <div data-el-id={el.id} style={boxStyle} onClick={handleClick} onMouseDown={editing ? (e) => e.stopPropagation() : onMouseDown}>
      <TextHTML html={html} style={{ display: editing ? 'none' : undefined }} />
      {editing && (
        <RichTextEditor
          content={content}
          fontSize={fontSize}
          fontColor={p.fontColor || '#333'}
          fontFamily={p.fontFamily || 'inherit'}
          fontWeight={p.fontWeight || 'normal'}
          fontStyle={p.fontStyle || 'normal'}
          textDecoration={p.textDecoration || 'none'}
          lineHeight={p.lineHeight || 1.5}
          textAlign={(p.textAlign || 'left') as 'left' | 'center' | 'right'}
          letterSpacing={p.letterSpacing || 0}
          onBlur={saveContent}
          onCancel={() => setEditing(false)}
          onComplete={(json) => {
            saveContent(json)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

export function ReadOnlyTextEl({ el }: EP) {
  const ss = shadowStyle(el.props)
  const p = el.props
  const content = p.content || defaultContent(p.text || '')
  const html = useMemo(() => renderRichTextHTML(content), [content])
  return (
    <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, fontSize: p.fontSize || 16, color: p.fontColor || '#333', fontFamily: p.fontFamily || 'inherit', fontWeight: p.fontWeight || 'normal', fontStyle: p.fontStyle || 'normal', textDecoration: p.textDecoration || 'none', lineHeight: p.lineHeight || 1.5, textAlign: (p.textAlign || 'left') as any, letterSpacing: (p.letterSpacing || 0) + 'px', overflow: 'hidden', padding: '2px 4px', overflowWrap: 'break-word', wordBreak: 'break-word' as any, boxShadow: ss, pointerEvents: 'none', userSelect: 'none' }}>
      <TextHTML html={html} />
    </div>
  )
}

// ─── List helpers ───

export function hasListInJSON(content: any, type: 'ol' | 'ul'): boolean {
  if (!content?.content) return false
  const target = type === 'ol' ? 'orderedList' : 'bulletList'
  return content.content.some((n: any) => n.type === target)
}

export function toggleListInJSON(content: any, listType: 'ol' | 'ul'): any {
  if (!content?.content) return content
  const targetType = listType === 'ol' ? 'orderedList' : 'bulletList'
  const listItems: any[] = []
  const remaining: any[] = []
  let collecting = true
  for (const node of content.content) {
    if (collecting && node.type === 'paragraph') {
      listItems.push({ type: 'listItem', content: [node] })
    } else if (collecting && (node.type === 'orderedList' || node.type === 'bulletList')) {
      listItems.push(...(node.content || []))
    } else { collecting = false; remaining.push(node) }
  }
  if (listItems.length === 0) return content
  return { ...content, content: [{ type: targetType, content: listItems }, ...remaining] }
}

export function removeListFromJSON(content: any): any {
  if (!content?.content) return content
  const nodes: any[] = []
  for (const node of content.content) {
    if (node.type === 'orderedList' || node.type === 'bulletList') {
      for (const item of (node.content || [])) {
        if (item.type === 'listItem') nodes.push(...(item.content || []))
      }
    } else { nodes.push(node) }
  }
  return { ...content, content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] }
}

// ─── Text config ───

export const textConfig: ElementConfig = {
  handles: ['nw', 'ne', 'w', 'e', 'sw', 'se'],
  onResizeStart(el, _handle, e) {
    return { mx: e.clientX, my: e.clientY, sx: el.x, sy: el.y, sw: el.w, sh: el.h, sFontSize: el.props.fontSize || 16 }
  },
  onResizeMove(state, el, handle, dx, dy, _shift) {
    const { sx, sy, sw, sh, sFontSize } = state
    if (handle.length === 2) {
      let nw = sw, nh = sh, nx = sx, ny = sy
      switch (handle) { case 'nw': nx = sx + dx; ny = sy + dy; nw = sw - dx; nh = sh - dy; break; case 'ne': ny = sy + dy; nw = sw + dx; nh = sh - dy; break; case 'sw': nx = sx + dx; nw = sw - dx; nh = sh + dy; break; case 'se': nw = sw + dx; nh = sh + dy; break }
      if (nw < 20) nw = 20; if (nh < 10) nh = 10
      const scale = nw / sw
      const newSize = Math.max(6, Math.min(999, Math.round(sFontSize * scale)))
      nh = sh * (newSize / sFontSize)
      return { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh), props: { ...el.props, fontSize: newSize } }
    }
    let nx = sx, ny = sy, nw = sw, nh = sh
    switch (handle) { case 'w': nx = sx + dx; nw = sw - dx; break; case 'e': nw = sw + dx; break }
    if (nw < 20) nw = 20; nh = sh
    return { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) }
  },
}
