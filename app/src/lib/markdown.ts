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
    const bindleRef = el.getAttribute('data-zell-ref')
    const width = el.getAttribute('width')

    // If resolved from bindle-img, use the original ref
    if (bindleRef) {
      const titleAttr = width ? ` "width=${width}"` : ''
      return `![${alt}](${bindleRef}${titleAttr})`
    }

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

// Preserve image-group: output <!-- zell-group:captions --> marker before images
turndown.addRule('imageGroup', {
  filter: (node) => {
    const el = node as HTMLElement
    return el.nodeName === 'DIV' && el.hasAttribute('data-image-group')
  },
  replacement: (content, node) => {
    const el = node as HTMLElement
    const captions = el.getAttribute('data-captions') || '[]'
    return `\n<!-- zell-group:${captions} -->\n${content.trim()}\n`
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
    let result = turndown.turndown(html)
    result = result.replace(/```(\w*)\n([\s\S]*?)\n+```/g, '```$1\n$2\n```')
    return result
  } catch {
    return html
  }
}

/**
 * Parse zell-group markers from Markdown and wrap images in group divs.
 * Format: <!-- zell-group:[...] --> \n ![img1] \n ![img2]
 */
export function restoreImageGroups(md: string): string {
  return md.replace(
    /<!-- zell-group:(\[.*?\]) -->\s*\n((?:\s*!\[[^\]]*\]\([^)]+\)\s*\n?)+)/g,
    (_match, captions: string, imagesBlock: string) => {
      const imgTags = imagesBlock.trim().split('\n').map((line) => line.trim()).join('')
      return `\n<div data-image-group data-captions='${captions}'>${imgTags}</div>\n`
    },
  )
}

export function markdownToHtml(md: string): string {
  if (!md) return ''
  try {
    const restored = restoreImageGroups(md)
    const result = marked.parse(restored, { async: false })
    return typeof result === 'string' ? result : ''
  } catch {
    return md
  }
}
