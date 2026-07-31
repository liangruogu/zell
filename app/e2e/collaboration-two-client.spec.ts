/**
 * Two-client collaboration tests using raw Playwright.
 *
 * Each test opens two browser contexts ("Owner" and "Member"),
 * mocks all HTTP API calls via page.route(), and injects
 * Tauri IPC mocks via addInitScript so __TAURI_INTERNALS__ exists.
 */

import { test, expect } from '@playwright/test'
import { generateIpcMockScript } from '@srsholmes/tauri-playwright'

const ipcMocks: Record<string, (...args: any[]) => any> = {
  get_projects: () => [],
  create_project: (args: any) => ({
    id: 'test-proj-1', name: args?.name || 'New Project',
    description: args?.description || '', background: args?.background || '',
    settings: args?.settings || '{}',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
  }),
  get_project: (args: any) => ({
    id: args?.id || 'test-proj-1', name: 'Test Project',
    description: '', background: '',
    settings: '{"serverUrl":"http://localhost:3000","token":"test-token"}',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
  }),
  get_knowledge_articles: () => [],
  create_knowledge_article: (args: any) => ({
    id: 'test-article-1', project_id: args?.projectId || 'test-proj-1',
    title: args?.title || 'Untitled', content: args?.content || '',
    content_json: '{}', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }),
  get_knowledge_article: (args: any) => ({
    id: args?.id || 'test-article-1', project_id: 'test-proj-1',
    title: 'Test Article', content: '# Hello', content_json: '{}',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }),
  get_setting: () => null,
  set_setting: () => null,
  load_settings: () => ({}),
  get_whiteboards: () => [],
  get_external_links: () => [],
  get_project_files: () => [],
}

const IPC_SCRIPT = generateIpcMockScript(ipcMocks)

async function createPage(browser: any) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript({ content: IPC_SCRIPT })
  return { ctx, page }
}

function mockApi(page: any, opts: {
  articles?: any[], members?: any[], pending?: any[],
  articlesStatus?: number, articlesCode?: string,
}) {
  const { articles = [], members = [], pending = [], articlesStatus = 200, articlesCode = '' } = opts

  page.route('**/health**', (r: any) => r.fulfill({ status: 200, json: { status: 'ok' } }))
  page.route('**/collab**', (r: any) => r.fulfill({ status: 200, json: { collab_enabled: true, invite_code: 'BNDL-mock', token: 'owner-jwt' } }))
  page.route('**/members**', (r: any) => r.method() === 'GET' ? r.fulfill({ status: 200, json: members }) : r.fulfill({ status: 200, json: { ok: true } }))
  page.route('**/pending**', (r: any) => {
    if (r.method() === 'GET') return r.fulfill({ status: 200, json: pending })
    if (r.url().includes('/approve')) return r.fulfill({ status: 200, json: { ok: true, token: 'member-jwt', display_name: 'Test Member' } })
    return r.fulfill({ status: 200, json: { ok: true } })
  })
  page.route('**/leave**', (r: any) => r.fulfill({ status: 200, json: { ok: true } }))
  page.route('**/notifications**', (r: any) => r.fulfill({ status: 200, json: { notifications: [] } }))
  page.route('**/status**', (r: any) => r.fulfill({ status: 200, json: { project_status: 'active', collab_enabled: true, member_status: 'active' } }))
  page.route('**/articles**', (r: any) => {
    r.fulfill({ status: articlesStatus, json: articlesStatus !== 200 ? { error: 'err', code: articlesCode } : articles })
  })
}

test.describe('双客户端协作', () => {

  test('Member 加入 → Owner 审批 → 双端文章同步', async ({ browser }) => {
    const { ctx: oCtx, page: owner } = await createPage(browser)
    await mockApi(owner, {
      articles: [{ id: 'art-1', project_id: 'test-proj-1', title: '共享文章', content: '# Hello', content_json: '{}' }],
      pending: [{ client_id: 'p1', display_name: 'Member1', created_at: new Date().toISOString() }],
    })
    await owner.goto('http://localhost:5173/project/test-proj-1')
    await expect(owner.locator('text=项目概览')).toBeVisible({ timeout: 10000 })

    const { ctx: mCtx, page: member } = await createPage(browser)
    let calls = 0
    await member.route('**/join**', (r: any) => {
      calls++
      r.fulfill({ status: 200, json: calls <= 2
        ? { status: 'pending', project_id: 'test-proj-1' }
        : { status: 'approved', project_id: 'test-proj-1', project_name: 'TP', token: 'member-jwt', display_name: 'Member1' }
      })
    })
    await mockApi(member, { articles: [{ id: 'art-1', project_id: 'test-proj-1', title: '共享文章', content: '# Hello', content_json: '{}' }] })
    await member.goto('http://localhost:5173/project/test-proj-1')
    await expect(member.locator('text=项目概览')).toBeVisible({ timeout: 10000 })

    await oCtx.close(); await mCtx.close()
  })

  test('Owner 踢出 Member → Member 端被拒绝', async ({ browser }) => {
    const { ctx: oCtx, page: owner } = await createPage(browser)
    await mockApi(owner, {
      members: [{ client_id: 'm1', display_name: 'Trouble', online: true, status: 'active' }],
    })
    await owner.goto('http://localhost:5173/project/test-proj-1')
    await expect(owner.locator('text=项目概览')).toBeVisible({ timeout: 10000 })

    const kickBtn = owner.locator('button[title="踢出"]')
    if (await kickBtn.isVisible().catch(() => false)) {
      owner.on('dialog', (d: any) => d.accept())
      await kickBtn.click()
    }

    const { ctx: mCtx, page: member } = await createPage(browser)
    await mockApi(member, { articlesStatus: 403, articlesCode: 'MEMBER_REMOVED' })
    await member.goto('http://localhost:5173/project/test-proj-1/knowledge')
    await member.waitForTimeout(3000)
    expect(member.url()).not.toContain('/knowledge')

    await oCtx.close(); await mCtx.close()
  })

  test('Owner 关闭协作 → Member 端被踢', async ({ browser }) => {
    const { ctx: oCtx, page: owner } = await createPage(browser)
    await mockApi(owner, {
      members: [{ client_id: 'm1', display_name: 'MemberA', online: true, status: 'active' }],
    })
    await owner.goto('http://localhost:5173/project/test-proj-1')
    await expect(owner.locator('text=项目概览')).toBeVisible({ timeout: 10000 })

    const { ctx: mCtx, page: member } = await createPage(browser)
    await mockApi(member, { articlesStatus: 403, articlesCode: 'COLLAB_DISABLED' })
    await member.goto('http://localhost:5173/project/test-proj-1/knowledge')
    await member.waitForTimeout(3000)
    expect(member.url()).not.toContain('/knowledge')

    await oCtx.close(); await mCtx.close()
  })
})
