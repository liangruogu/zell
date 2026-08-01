import { waitForApp, createProject, openKnowledgeTab, createArticle, typeInEditor, selectArticle, clickButton } from './helpers.js'

describe('@smoke 单人知识库完整流程', () => {
  before(async () => { await waitForApp() })

  it('should complete full knowledge base workflow', async () => {
    // ── Setup ────────────────────────────────────────────────
    await createProject('E2E-Full')
    await openKnowledgeTab()

    // ── Article 1: headings, task list, table ──────────────────
    await createArticle('Format Test')

    // Headings (single-line markdown works)
    await typeInEditor('# H1 Heading')
    await browser.keys('Enter')
    await typeInEditor('## H2 Section')
    await browser.keys('Enter', 'Enter')

    // Task list: Ctrl+Shift+X
    await browser.keys(['Control', 'Shift', 'x'])
    await typeInEditor('buy groceries')
    await browser.keys('Enter')

    // Table: Ctrl+Shift+T
    await browser.keys(['Control', 'Shift', 't'])
    await browser.pause(800)

    // Regular text
    await typeInEditor('Normal paragraph here.')

    await browser.pause(500)
    let editor = await $('.ProseMirror')
    await expect(editor.$('h1')).toBePresent()
    await expect(editor.$('h2')).toBePresent()
    await expect(editor.$('ul[data-type="taskList"]')).toBePresent()
    await expect(editor.$('table')).toBePresent()

    // ── Article 2: code block, math ───────────────────────────
    await createArticle('Code & Math')
    await typeInEditor('```python\nprint("hello")\nfor i in range(3):\n    print(i)\n```')
    await browser.keys('Enter', 'Enter')
    await typeInEditor('$$\nE = mc^2\n$$')
    await browser.pause(500)
    editor = await $('.ProseMirror')
    await expect(editor.$('pre')).toBePresent()
    await expect(editor.$('math-display, .katex')).toBePresent()

    // ── Export PDF ────────────────────────────────────────────
    const exportBtn = await $('button[title="导出"]')
    await exportBtn.click()
    await browser.pause(300)
    const pdfBtn = await $('button=PDF')
    await expect(pdfBtn).toBePresent()
    await pdfBtn.click()
    await browser.pause(2000)
    // Should not crash, verify app is still alive
    await expect($('body')).toBePresent()

    // ── Export DOCX ───────────────────────────────────────────
    const exportBtn2 = await $('button[title="导出"]')
    await exportBtn2.click()
    await browser.pause(300)
    const docxBtn = await $('button=DOCX')
    await expect(docxBtn).toBePresent()
    await docxBtn.click()
    await browser.pause(2000)
    await expect($('body')).toBePresent()

    // ── Export HTML ───────────────────────────────────────────
    const exportBtn3 = await $('button[title="导出"]')
    await exportBtn3.click()
    await browser.pause(300)
    const htmlBtn = await $('button=HTML')
    await expect(htmlBtn).toBePresent()
    await htmlBtn.click()
    await browser.pause(2000)
    await expect($('body')).toBePresent()

    // ── Article 3: content persistence ────────────────────────
    await createArticle('Persist Me')
    await typeInEditor('## Will it stay?\n\nYes it will.')
    await browser.pause(1500)
    await selectArticle('Code & Math')
    await browser.pause(300)
    await selectArticle('Persist Me')
    await browser.pause(500)
    editor = await $('.ProseMirror')
    const text = await editor.getText()
    expect(text).toContain('Will it stay')

    // ── Delete article ────────────────────────────────────────
    await selectArticle('Format Test')
    await browser.pause(300)
    const article = await $('span=Format Test')
    await article.moveTo()
    await browser.pause(300)
    const delBtn = await $('button[title="删除"]')
    await delBtn.click()
    await browser.pause(300)
    await clickButton('确认删除')
    await browser.pause(500)
    const gone = await $$('span=Format Test')
    expect(gone.length).toBe(0)

    // ── Image paste via clipboard ──────────────────────────────
    // 1x1 red PNG base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    await browser.execute((b64) => {
      const editor = document.querySelector('.ProseMirror')
      if (!editor) return

      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], 'paste-test.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)

      editor.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }))
    }, pngBase64)
    await browser.pause(2000)
    let imgs = await $$('.ProseMirror img')
    expect(imgs.length).toBeGreaterThan(0)

    // ── Image drag & drop ──────────────────────────────────────
    await browser.execute((b64) => {
      const editor = document.querySelector('.ProseMirror')
      if (!editor) return

      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], 'drag-test.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)

      const rect = editor.getBoundingClientRect()
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2

      editor.dispatchEvent(new DragEvent('dragover', {
        dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx, clientY: cy,
      }))
      editor.dispatchEvent(new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx, clientY: cy,
      }))
    }, pngBase64)
    await browser.pause(2000)
    imgs = await $$('.ProseMirror img')
    expect(imgs.length).toBeGreaterThan(1) // one from paste, one from drag
  })
})
