import { describe, it, expect } from 'vitest'
import { extractImagePaths } from '@/lib/clipboard'

describe('extractImagePaths', () => {
  it('extracts a file:// URI with absolute path', () => {
    const result = extractImagePaths('file:///home/user/Pictures/photo.png')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/user/Pictures/photo.png')
  })

  it('extracts a plain absolute path (KDE clipboard)', () => {
    const result = extractImagePaths('/home/ele/Downloads/screenshot.jpg')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/ele/Downloads/screenshot.jpg')
  })

  it('decodes percent-encoded file paths', () => {
    const result = extractImagePaths(
      'file:///home/ele/Downloads/%E5%93%B2%E9%A3%8E%E5%A3%81%E7%BA%B8.png',
    )
    expect(result).toHaveLength(1)
    expect(result[0].path).toContain('哲风壁纸')
  })

  it('extracts image paths from HTML (KDE Dolphin format)', () => {
    const result = extractImagePaths(
      '<a style="color: rgb(0,0,0)" href="file:///home/ele/Pictures/cat.png">file:///home/ele/Pictures/cat.png</a>',
    )
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/ele/Pictures/cat.png')
  })

  it('extracts plain path from HTML (KDE paste format)', () => {
    const result = extractImagePaths(
      '<p data-pm-slice="1 1 []">/home/ele/Downloads/image.png</p>',
    )
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/ele/Downloads/image.png')
  })

  it('returns empty for non-image paths', () => {
    const result = extractImagePaths('/home/user/document.pdf')
    expect(result).toHaveLength(0)
  })

  it('handles multiple images in mixed text', () => {
    const text = `Some text
file:///home/user/a.png
more text
/home/user/b.jpg
end`
    const result = extractImagePaths(text)
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('/home/user/a.png')
    expect(result[1].path).toBe('/home/user/b.jpg')
  })

  it('deduplicates repeated paths', () => {
    const result = extractImagePaths('file:///tmp/img.png\nfile:///tmp/img.png')
    expect(result).toHaveLength(1)
  })

  it('matches all supported image extensions', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']) {
      const result = extractImagePaths(`/tmp/file.${ext}`)
      expect(result).toHaveLength(1)
    }
  })

  it('rejects non-image extensions', () => {
    const result = extractImagePaths('/tmp/file.txt')
    expect(result).toHaveLength(0)
  })

  it('extracts file URI with spaces percent-encoded', () => {
    const result = extractImagePaths('file:///home/user/My%20Photos/vacation.jpg')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/user/My Photos/vacation.jpg')
  })

  it('handles empty input', () => {
    expect(extractImagePaths('')).toHaveLength(0)
    expect(extractImagePaths('\n\n')).toHaveLength(0)
  })

  it('handles uppercase extensions', () => {
    const result = extractImagePaths('/tmp/PHOTO.PNG')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/tmp/PHOTO.PNG')
  })

  it('does not match mid-string image extensions', () => {
    const result = extractImagePaths('/tmp/png/file.txt')
    expect(result).toHaveLength(0)
  })
})
