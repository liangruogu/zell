import TurndownService from 'turndown'
import { marked } from 'marked'
import { convertFileSrc } from '@tauri-apps/api/core'

let _imagesBaseDir: string | null = null

export function setImagesBaseDir(dir: string) {
  _imagesBaseDir = dir
}

function bindleImgToSrc(ref: string): string {
  if (!_imagesBaseDir) return ref
  // ref format: "projId/fileName"
  const path = `${_imagesBaseDir}/projects/${ref}`
  return convertFileSrc(path)
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
})

// Preserve image width and convert asset URLs back to bindle-img refs
turndown.addRule('imageWithSize', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') || ''
    const src = el.getAttribute('src') || ''
    const width = el.getAttribute('width')

    // If src is an asset URL (from convertFileSrc), convert back to bindle-img ref
    if (_imagesBaseDir && src.includes('/images/')) {
      try {
        const url = new URL(src)
        const decoded = decodeURIComponent(url.pathname)
        const idx = decoded.lastIndexOf('/projects/')
        if (idx >= 0) {
          const relative = decoded.slice(idx + '/projects/'.length) // "projId/images/fileName"
          const bindleRef = `bindle-img:${relative}`
          const titleAttr = width ? ` "width=${width}"` : ''
          return `![${alt}](${bindleRef}${titleAttr})`
        }
      } catch { /* not a URL, use as-is */ }
    }

    // Keep bindle-img: refs as-is
    if (src.startsWith('bindle-img:')) {
      const titleAttr = width ? ` "width=${width}"` : ''
      return `![${alt}](${src}${titleAttr})`
    }

    return `![${alt}](${src})`
  },
})

// Custom image renderer: resolve bindle-img to asset URLs
marked.use({
  renderer: {
    image({ href, title, text }: { href: string; title: string | null; text: string }) {
      let widthAttr = ''
      if (title) {
        const wm = title.match(/width=(\d+)/)
        if (wm) widthAttr = ` width="${wm[1]}"`
      }
      const src = href.startsWith('bindle-img:') ? bindleImgToSrc(href.replace('bindle-img:', '')) : href
      return `<img src="${src}" alt="${text}"${widthAttr}>`
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
