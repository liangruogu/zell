import { waitForApp, createProject, openKnowledgeTab, createArticle, typeInEditor, selectArticle, clickButton } from './helpers.js'

describe('@smoke 单人内容持久化', () => {
  before(async () => { await waitForApp() })

  it('should persist article content after switching articles and returning', async () => {
    await createProject('E2E-Persist')
    await openKnowledgeTab()

    // 1. Create article with content
    await createArticle('Content Test')
    await typeInEditor('# My Heading\n\nThis is paragraph one.\n\nAnother paragraph with **bold** text.')
    await browser.pause(2000) // wait for debounced save (800ms) + margin

    // 2. Create a second empty article to force editor remount
    await createArticle('Second Article')
    await browser.pause(500)

    // 3. Switch back to first article and verify content persisted
    await selectArticle('Content Test')
    await browser.pause(1000)

    const editor = await $('.ProseMirror')
    await expect(editor).toBePresent()
    const text = await editor.getText()

    // Verify all content survived
    expect(text).toContain('My Heading')
    expect(text).toContain('This is paragraph one')
    expect(text).toContain('Another paragraph')
    expect(text).toContain('bold')

    // Verify heading structure
    const h1 = await editor.$('h1')
    await expect(h1).toBePresent()
  })

  it('should not lose content on editor re-initialization', async () => {
    await createProject('E2E-NoLoss')
    await openKnowledgeTab()

    // 1. Create article
    await createArticle('Init Test')
    await browser.pause(500)

    // 2. Wait for potential initial onUpdate save (the bug was saving empty content here)
    await browser.pause(1500)

    // 3. Now type content
    await typeInEditor('Content typed after init delay.')
    await browser.pause(2000)

    // 4. Switch away and back to force reload
    await createArticle('Dummy')
    await selectArticle('Init Test')
    await browser.pause(1000)

    const editor = await $('.ProseMirror')
    const text = await editor.getText()
    expect(text).toContain('Content typed after init delay')
  })

  it('should preserve content across project navigation', async () => {
    await createProject('E2E-Navigate')
    await openKnowledgeTab()

    await createArticle('Nav Test')
    await typeInEditor('## Navigation Test\n\nThis content should survive project navigation.')
    await browser.pause(2000)

    // Navigate back to home, then back to project
    await browser.execute(() => { window.location.href = '/' })
    await browser.pause(1000)

    // Find project card and click it
    await clickButton('E2E-Navigate')
    await browser.pause(1500)

    await openKnowledgeTab()
    await selectArticle('Nav Test')
    await browser.pause(1000)

    const editor = await $('.ProseMirror')
    const text = await editor.getText()
    expect(text).toContain('Navigation Test')
    expect(text).toContain('survive project navigation')
  })
})
