import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, markdownToHtml, markdownToPreviewHtml } from '@/lib/markdown'

describe('htmlToMarkdown', () => {
  it('converts basic HTML to markdown', () => {
    const result = htmlToMarkdown('<h1>Hello</h1><p>World</p>')
    expect(result).toContain('# Hello')
    expect(result).toContain('World')
  })

  it('returns empty string for falsy input', () => {
    expect(htmlToMarkdown('')).toBe('')
  })

  it('converts bold and italic', () => {
    const result = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>')
    expect(result).toContain('**bold**')
    expect(result).toContain('*italic*')
  })

  it('converts links', () => {
    const result = htmlToMarkdown('<a href="https://example.com">Example</a>')
    expect(result).toContain('[Example](https://example.com)')
  })

  it('converts images with src', () => {
    const result = htmlToMarkdown('<img src="https://example.com/img.png" alt="test">')
    expect(result).toContain('![test](https://example.com/img.png)')
  })

  it('converts images with data-zell-ref attribute', () => {
    const result = htmlToMarkdown(
      '<img src="https://example.com/img.png" alt="test" data-zell-ref="zell://img/123">',
    )
    expect(result).toContain('![test](zell://img/123)')
  })

  it('converts images with zell-img: src', () => {
    const result = htmlToMarkdown(
      '<img src="zell-img:abc123" alt="diagram">',
    )
    expect(result).toContain('![diagram](zell-img:abc123)')
  })

  it('preserves width for zell-img images', () => {
    const result = htmlToMarkdown(
      '<img src="zell-img:abc123" alt="diagram" width="300">',
    )
    expect(result).toContain('"width=300"')
  })

  it('converts math-inline elements', () => {
    const result = htmlToMarkdown(
      '<p>Inline: <math-inline>x^2</math-inline> here</p>',
    )
    expect(result).toContain('$x^2$')
  })

  it('converts math-display elements', () => {
    const result = htmlToMarkdown(
      '<p>Before</p><math-display>\\int_0^1 x dx</math-display><p>After</p>',
    )
    expect(result).toContain('$$')
    expect(result).toContain('\\int_0^1 x dx')
  })

  it('returns original HTML on error', () => {
    const html = '<p>valid</p>'
    expect(htmlToMarkdown(html)).toBeTruthy()
  })
})

describe('markdownToHtml', () => {
  it('converts basic markdown to HTML', () => {
    const result = markdownToHtml('# Hello\n\nWorld')
    expect(result).toContain('<h1>')
    expect(result).toContain('Hello')
    expect(result).toContain('<p>')
  })

  it('returns empty string for falsy input', () => {
    expect(markdownToHtml('')).toBe('')
  })

  it('converts bold and italic markdown', () => {
    const result = markdownToHtml('**bold** and *italic*')
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<em>italic</em>')
  })

  it('converts links', () => {
    const result = markdownToHtml('[Example](https://example.com)')
    expect(result).toContain('<a href="https://example.com"')
  })

  it('converts images', () => {
    const result = markdownToHtml('![test](https://example.com/img.png)')
    expect(result).toContain('<img src="https://example.com/img.png" alt="test"')
  })

  it('converts display math to math-display tags', () => {
    const result = markdownToHtml('$$\nx^2\n$$')
    expect(result).toContain('<math-display')
    expect(result).toContain('x^2')
  })

  it('converts inline math to math-inline tags', () => {
    const result = markdownToHtml('value $x^2$ inline')
    expect(result).toContain('<math-inline')
    expect(result).toContain('x^2')
  })

  it('handles single dollar signs safely', () => {
    const result = markdownToHtml('The price is $5.')
    expect(result).toContain('The price is')
    expect(result).toContain('5')
  })

  it('converts markdown task lists to checkbox HTML', () => {
    const result = markdownToHtml(
      '- [ ] Task one\n- [x] Task done',
    )
    expect(result).toContain('type="checkbox"')
    expect(result).toContain('Task one')
  })

  it('converts code blocks', () => {
    const result = markdownToHtml('```js\nconst x = 1;\n```')
    expect(result).toContain('<code')
    expect(result).toContain('const x = 1;')
  })
})

describe('markdownToPreviewHtml', () => {
  it('converts basic markdown to preview HTML', () => {
    const result = markdownToPreviewHtml('# Hello\n\nWorld')
    expect(result).toContain('<h1>')
    expect(result).toContain('Hello')
  })

  it('returns empty string for falsy input', () => {
    expect(markdownToPreviewHtml('')).toBe('')
  })

  it('renders inline math with katex', () => {
    const result = markdownToPreviewHtml('value $x^2$ inline')
    expect(result).toContain('math-inline-preview')
  })

  it('renders display math with katex', () => {
    const result = markdownToPreviewHtml('$$\nE = mc^2\n$$')
    expect(result).toContain('math-display-preview')
  })

  it('handles invalid katex gracefully', () => {
    const result = markdownToPreviewHtml('$$\n\\invalid\n$$')
    expect(result).toBeTruthy()
  })

  it('converts bold and italic', () => {
    const result = markdownToPreviewHtml('**bold** and *italic*')
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<em>italic</em>')
  })
})
