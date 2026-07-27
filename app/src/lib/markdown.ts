import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { marked } from 'marked'
import katex from 'katex'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
})

// GFM support: tables, strikethrough, task lists
turndown.use(gfm)

// Preserve image width and zell-img refs
turndown.addRule('imageWithSize', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') || ''
    const src = el.getAttribute('src') || ''
    const imgRef = el.getAttribute('data-zell-ref')
    const width = el.getAttribute('width')

    if (imgRef) {
      const titleAttr = width ? ` "width=${width}"` : ''
      return `![${alt}](${imgRef}${titleAttr})`
    }
    if (src.startsWith('zell-img:')) {
      const titleAttr = width ? ` "width=${width}"` : ''
      return `![${alt}](${src}${titleAttr})`
    }
    if (src.startsWith('data:')) {
      return `![${alt}](${src})`
    }
    return `![${alt}](${src})`
  },
})

// Math inline -> $latex$
turndown.addRule('mathInline', {
  filter: (node) => (node as HTMLElement).nodeName === 'MATH-INLINE',
  replacement: (_content, node) => `$${(node as HTMLElement).textContent || ''}$`,
})

// Math display -> $$latex$$
turndown.addRule('mathDisplay', {
  filter: (node) => (node as HTMLElement).nodeName === 'MATH-DISPLAY',
  replacement: (_content, node) => `\n$$\n${(node as HTMLElement).textContent || ''}\n$$\n`,
})

// Custom image renderer
marked.use({
  renderer: {
    image({ href, title, text }: { href: string; title: string | null; text: string }) {
      let widthAttr = ''
      if (title) {
        const wm = title.match(/width=(\d+)/)
        if (wm) widthAttr = ` width="${wm[1]}"`
      }
      return `<img src="${href}" alt="${text}"${widthAttr}>`
    },
  },
})

export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  try {
    // Strip TipTap task list wrappers for GFM
    html = html.replace(/<ul data-type="taskList">/g, '<ul>')
    html = html.replace(/<li><label><input type="checkbox"\s*(checked(?:="true")?)?\s*><\/label><div><p>/g,
      (_, checked) => `<li><input type="checkbox"${checked ? ' checked' : ''}>`)
    html = html.replace(/<\/p><\/div><\/li>/g, '</li>')
    let result = turndown.turndown(html)
    result = result.replace(/```(\w*)\n([\s\S]*?)\n+```/g, '```$1\n$2\n```')
    return result
  } catch {
    return html
  }
}

// ── Math placeholder helpers ──────────────────────────────────────────

let _mathId = 0
function mathPlaceholder(type: string, latex: string): string {
  _mathId++
  return `\x00MATH_${type}_${_mathId}_${latex}\x00`
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderKatex(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode: display, throwOnError: false })
  } catch {
    return `<span style="color:#ef4444">${escapeText(latex)}</span>`
  }
}

// ── For TipTap editor (outputs <math-inline>/<math-display> elements) ──

export function markdownToHtml(md: string): string {
  if (!md) return ''
  try {
    _mathId = 0

    const displayMaths: { placeholder: string; latex: string }[] = []
    let processed = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex) => {
      const ph = mathPlaceholder('display', latex.trim())
      displayMaths.push({ placeholder: ph, latex: latex.trim() })
      return ph
    })

    const inlineMaths: { placeholder: string; latex: string }[] = []
    processed = processed.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, latex) => {
      const ph = mathPlaceholder('inline', latex.trim())
      inlineMaths.push({ placeholder: ph, latex: latex.trim() })
      return ph
    })

    const result = marked.parse(processed, { async: false })
    let html = typeof result === 'string' ? result : ''

    // Restore TipTap task list attribute
    html = html.replace(/<ul>\s*(?=<li>\s*<input\s+type="checkbox")/g, '<ul data-type="taskList">')

    for (const { placeholder, latex } of displayMaths) {
      html = html.replace(placeholder, `<math-display class="math-node">${escapeText(latex)}</math-display>`)
    }
    for (const { placeholder, latex } of inlineMaths) {
      html = html.replace(placeholder, `<math-inline class="math-node">${escapeText(latex)}</math-inline>`)
    }

    return html
  } catch {
    return md
  }
}

// ── For split mode preview (renders katex inline) ─────────────────────

export function markdownToPreviewHtml(md: string): string {
  if (!md) return ''
  try {
    _mathId = 0

    // Protect display math
    const displayMaths: { placeholder: string; html: string }[] = []
    let processed = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex) => {
      const ph = mathPlaceholder('display', latex.trim())
      displayMaths.push({ placeholder: ph, html: renderKatex(latex.trim(), true) })
      return ph
    })

    // Protect inline math
    const inlineMaths: { placeholder: string; html: string }[] = []
    processed = processed.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, latex) => {
      const ph = mathPlaceholder('inline', latex.trim())
      inlineMaths.push({ placeholder: ph, html: renderKatex(latex.trim(), false) })
      return ph
    })

    const result = marked.parse(processed, { async: false })
    let html = typeof result === 'string' ? result : ''

    // Restore display math with rendered katex
    for (const { placeholder, html: kh } of displayMaths) {
      html = html.replace(placeholder, `<div class="math-display-preview">${kh}</div>`)
    }
    for (const { placeholder, html: kh } of inlineMaths) {
      html = html.replace(placeholder, `<span class="math-inline-preview">${kh}</span>`)
    }

    return html
  } catch {
    return md
  }
}
