import { waitForApp, createProject, openKnowledgeTab, createArticle, typeInEditor, clickButton, fillInput, getServerKey, getServerUrl } from './helpers.js'

describe('@smoke 基础协作流程', () => {
    before(async () => { await waitForApp() })

    it('should connect, edit, and verify collaboration', async () => {
        // 1. Create project and connect to server
        await createProject('E2E-Collab')
        await browser.pause(500)

        // Navigate to project overview
        const tabs = await $$('button')
        for (const btn of tabs) {
            const text = await btn.getText()
            if (text.includes('概览') || text.includes('设置')) { await btn.click(); break }
        }
        await browser.pause(1000)

        // Fill server info and connect
        await fillInput('服务器地址', getServerUrl())
        await fillInput('密钥', getServerKey())
        await clickButton('连接')
        await browser.pause(2000)

        // 2. Open knowledge tab and create article
        await openKnowledgeTab()
        await createArticle('Collab Doc')
        await typeInEditor('## Collaboration Test\n\nReal-time editing')
        await browser.pause(1000)

        // 3. Verify editor works in collaboration mode
        const editor = await $('.ProseMirror')
        await expect(editor).toBePresent()
        const text = await editor.getText()
        expect(text).toContain('Collaboration')

        // 4. Verify theme/config settings exist
        const tabs2 = await $$('button')
        for (const btn of tabs2) {
            const text = await btn.getText()
            if (text.includes('设置')) { await btn.click(); break }
        }
        await browser.pause(500)
        const themeBtn = await $('button=GitHub')
        await expect(themeBtn).toBePresent()
    })
})
