import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractImagePaths } from './clipboard'

describe('extractImagePaths', () => {

  it('extracts a file:// URI with absolute path', () => {
    const result = extractImagePaths(
      'file:///home/user/Pictures/photo.png'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/home/user/Pictures/photo.png')
  })

  it('extracts a plain absolute path (KDE clipboard)', () => {
    const result = extractImagePaths(
      '/home/ele/Downloads/screenshot.jpg'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/home/ele/Downloads/screenshot.jpg')
  })

  it('decodes percent-encoded file paths', () => {
    const result = extractImagePaths(
      'file:///home/ele/Downloads/%E5%93%B2%E9%A3%8E%E5%A3%81%E7%BA%B8.png'
    )
    assert.equal(result.length, 1)
    assert(result[0].path.includes('哲风壁纸'))
  })

  it('extracts image paths from HTML (KDE Dolphin format)', () => {
    const result = extractImagePaths(
      '<a style="color: rgb(0,0,0)" href="file:///home/ele/Pictures/cat.png">file:///home/ele/Pictures/cat.png</a>'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/home/ele/Pictures/cat.png')
  })

  it('extracts plain path from HTML (KDE paste format)', () => {
    const result = extractImagePaths(
      '<p data-pm-slice="1 1 []">/home/ele/Downloads/image.png</p>'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/home/ele/Downloads/image.png')
  })

  it('returns empty for non-image paths', () => {
    const result = extractImagePaths('/home/user/document.pdf')
    assert.equal(result.length, 0)
  })

  it('handles multiple images in mixed text', () => {
    const text = `Some text
file:///home/user/a.png
more text
/home/user/b.jpg
end`
    const result = extractImagePaths(text)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, '/home/user/a.png')
    assert.equal(result[1].path, '/home/user/b.jpg')
  })

  it('deduplicates repeated paths', () => {
    const result = extractImagePaths(
      'file:///tmp/img.png\nfile:///tmp/img.png'
    )
    assert.equal(result.length, 1)
  })

  it('matches all supported image extensions', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']) {
      const result = extractImagePaths(`/tmp/file.${ext}`)
      assert.equal(result.length, 1, `should match .${ext}`)
    }
  })

  it('rejects non-image extensions', () => {
    const result = extractImagePaths('/tmp/file.txt')
    assert.equal(result.length, 0)
  })

  it('extracts file URI with spaces percent-encoded', () => {
    const result = extractImagePaths(
      'file:///home/user/My%20Photos/vacation.jpg'
    )
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/home/user/My Photos/vacation.jpg')
  })

  it('handles empty input', () => {
    assert.equal(extractImagePaths('').length, 0)
    assert.equal(extractImagePaths('\n\n').length, 0)
  })

  it('handles uppercase extensions', () => {
    const result = extractImagePaths('/tmp/PHOTO.PNG')
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/tmp/PHOTO.PNG')
  })

  it('does not match mid-string image extensions', () => {
    const result = extractImagePaths('/tmp/png/file.txt')
    assert.equal(result.length, 0)
  })
})
