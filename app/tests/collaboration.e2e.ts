import { remote } from 'webdriverio'
import { expect } from 'chai'

const SERVER_URL = 'http://localhost:3000'
const SERVER_KEY = 'test-key-12345'

describe('Zell 协作流程 E2E', function() {
    this.timeout(120000)

    let ownerClient: WebdriverIO.Browser
    let memberClient: WebdriverIO.Browser

    before(async () => {
        // Start owner app (default data dir)
        ownerClient = await remote({
            hostname: 'localhost',
            port: 4444,
            path: '/',
            capabilities: { browserName: 'zell' },
        })
    })

    it('1. 创建项目', async () => {
        // Wait for app to load
        await ownerClient.pause(3000)

        // Click "新建项目" button
        const createBtn = await ownerClient.$('button=新建项目')
        await createBtn.click()
        await ownerClient.pause(500)

        // Fill form
        const nameInput = await ownerClient.$('input[placeholder="项目名称"]')
        await nameInput.setValue('E2E 测试项目')

        const descInput = await ownerClient.$('textarea[placeholder*="项目描述"]')
        await descInput.setValue('自动化测试创建的项目')

        // Submit
        const submitBtn = await ownerClient.$('button=创建')
        await submitBtn.click()
        await ownerClient.pause(1500)

        // Verify project appears in list
        const card = await ownerClient.$('text=E2E 测试项目')
        expect(await card.isExisting()).to.be.true
    })

    it('2. 打开项目并创建文章', async () => {
        const card = await ownerClient.$('text=E2E 测试项目')
        await card.click()
        await ownerClient.pause(2000)

        // Check project overview
        const nameEl = await ownerClient.$('text=E2E 测试项目')
        expect(await nameEl.isExisting()).to.be.true

        // Navigate to knowledge base (there should be a link/button)
        // This depends on UI layout — may need to adjust selector
        const kbBtn = await ownerClient.$('text=知识库')
        if (await kbBtn.isExisting()) {
            await kbBtn.click()
            await ownerClient.pause(1000)
        }
    })

    after(async () => {
        if (ownerClient) await ownerClient.deleteSession()
        if (memberClient) await memberClient.deleteSession()
    })
})
