import TurndownService from 'turndown'
import { marked } from 'marked'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
})

// Preserve image width: convert to ![alt](url =400x)
turndown.addRule('imageWithSize', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') || ''
    const src = el.getAttribute('src') || ''
    const width = el.getAttribute('width')
    const title = width ? ` =${width}x` : ''
    return `![${alt}](${src}${title})`
  },
})

// Custom image renderer: support ![alt](url =400x) syntax
marked.use({
  renderer: {
    image({ href, text }: { href: string; text: string }) {
      const match = href.match(/^(.+?)\s*=\s*(\d+)x$/)
      if (match) {
        return `<img src="${match[1]}" alt="${text}" width="${match[2]}">`
      }
      return `<img src="${href}" alt="${text}">`
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
