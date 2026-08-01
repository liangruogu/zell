import { waitForApp, createProject, openKnowledgeTab, createArticle, typeInEditor, clickButton, fillInput, getServerKey, getServerUrl, killServer, startServer, selectArticle } from './helpers.js'

describe('@release 复杂协作场景', () => {
  before(async () => { await waitForApp() })

  it('should handle server disconnect and reconnect', async () => {
    // 1. Connect to server
    await createProject('E2E-Disconnect')
    await browser.pause(500)
    const tabs = await $$('button')
    for (const btn of tabs) {
      const text = await btn.getText()
      if (text.includes('概览') || text.includes('设置')) { await btn.click(); break }
    }
    await browser.pause(1000)
    await fillInput('服务器地址', getServerUrl())
    await fillInput('密钥', getServerKey())
    await clickButton('连接')
    await browser.pause(2000)

    // 2. Edit in collaboration mode
    await openKnowledgeTab()
    await createArticle('Resilience Test')
    await typeInEditor('# Before disconnect\n\nContent here')
    await browser.pause(1000)

    // 3. Kill server → simulate disconnect
    killServer()
    await browser.pause(2000)
    await typeInEditor('\n\nStill working offline')
    await browser.pause(500)
    let editor = await $('.ProseMirror')
    await expect(editor).toBePresent()

    // 4. Restart server → reconnect
    startServer()
    await browser.pause(3000)
    await fillInput('服务器地址', getServerUrl())
    await fillInput('密钥', getServerKey())
    await clickButton('连接')
    await browser.pause(2000)

    // 5. Navigate back to article, verify content survived
    const tabs2 = await $$('button')
    for (const btn of tabs2) {
      const text = await btn.getText()
      if (text.includes('知识')) { await btn.click(); break }
    }
    await browser.pause(500)
    await selectArticle('Resilience Test')
    editor = await $('.ProseMirror')
    const text = await editor.getText()
    expect(text).toContain('Content')
    expect(text).toContain('offline')
  })
})
