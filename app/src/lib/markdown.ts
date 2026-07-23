import TurndownService from 'turndown'
import { marked } from 'marked'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
})

// Preserve image width and bindle-img refs
turndown.addRule('imageWithSize', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') || ''
    const src = el.getAttribute('src') || ''
    const width = el.getAttribute('width')

    if (src.startsWith('bindle-img:')) {
      const titleAttr = width ? ` "width=${width}"` : ''
      return `![${alt}](${src}${titleAttr})`
    }

    if (src.startsWith('data:')) {
      return `![${alt}](${src})`
    }

    return `![${alt}](${src})`
  },
})

// Custom image renderer: keep bindle-img refs as-is (resolved later)
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
    return turndown.turndown(html)
  } catch {
    return html
  }
}

export function markdownToHtml(md: string): string {
  if (!md) return ''
  try {
    const result = marked.parse(md, { async: false })
    return typeof result === 'string' ? result : ''
  } catch {
    return md
  }
}
