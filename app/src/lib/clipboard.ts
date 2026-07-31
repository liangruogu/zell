import { logger } from '@/lib/logger'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']

const IMAGE_PATH_RE = new RegExp(
  `(file:/{1,3}[^\\s"'<>\\n\\r]+|/[^\\s"'<>\\n\\r]+\\.(${IMAGE_EXTS.join('|')}))`,
  'gi'
)

export interface ImageFileRef {
  /** Absolute filesystem path, ready for readFile */
  path: string
  /** Original matched URI before stripping file:// prefix */
  raw: string
}

/**
 * Scan clipboard text (combined from all MIME types) for image file references.
 * Matches both file:// URIs (drag-drop) and plain absolute paths (KDE clipboard).
 * Returns decoded absolute paths suitable for Tauri's readFile.
 */
export function extractImagePaths(text: string): ImageFileRef[] {
  const results: ImageFileRef[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(IMAGE_PATH_RE)) {
    const raw = match[0]
    if (seen.has(raw)) continue
    seen.add(raw)
    let filePath = raw.replace(/^file:\/\//, '')
    try { filePath = decodeURIComponent(filePath) } catch (e) { logger.error('Failed to decode URI component', e) }
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    if (!IMAGE_EXTS.includes(ext)) continue
    results.push({ path: filePath, raw })
  }
  return results
}

/**
 * Build a combined text blob from clipboardData (handles both DragEvent and ClipboardEvent).
 * Use this as input to extractImagePaths.
 */
export function clipboardDataToText(data: DataTransfer | null): string {
  if (!data) return ''
  const parts: string[] = []
  const types = data.types
  if (types) {
    for (const t of types) {
      try { parts.push(data.getData(t)) } catch (e) { logger.error('Failed to read clipboard data', e) }
    }
  }
  // Also try DataTransferItem.getAsString for platforms where getData returns empty
  return parts.join('\n')
}
