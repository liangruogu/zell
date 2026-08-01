import { waitForApp, createProject, openKnowledgeTab, createArticle, typeInEditor, clickButton, fillInput, getServerKey, getServerUrl } from './helpers.js'

describe('@release 多人协作完整流程', () => {
  before(async () => { await waitForApp() })

  it('should sync articles between server and simulate second client', async () => {
    // ─── 1. Client 1: Create project and connect to server ───
    await createProject('E2E-MultiClient')
    await browser.pause(500)

    let tabs = await $$('button')
    for (const btn of tabs) {
      const text = await btn.getText()
      if (text.includes('概览') || text.includes('设置')) { await btn.click(); break }
    }
    await browser.pause(1000)

    await fillInput('服务器地址', getServerUrl())
    await fillInput('密钥', getServerKey())
    await clickButton('连接')
    await browser.pause(2000)

    // ─── 2. Client 1: Create and edit article ───
    await openKnowledgeTab()
    await createArticle('Sync Test')
    await typeInEditor('# Synced Article\n\nContent from client one.')
    await browser.pause(2000)

    // ─── 3. Get server project/invite info ───
    const serverInfo = await browser.execute(async (serverUrl, serverKey) => {
      const res = await fetch(`${serverUrl}/api/v1/projects`, {
        headers: { 'X-Server-Key': serverKey },
      })
      const list = await res.json()

      const proj = Array.isArray(list) ? list.find(p => p.name === 'E2E-MultiClient') : null
      if (!proj) return { error: 'project not found on server' }

      const inviteRes = await fetch(`${serverUrl}/api/v1/projects/${proj.id}/invite`, {
        headers: { 'X-Server-Key': serverKey },
      })
      const inviteData = await inviteRes.json()

      return {
        projectId: proj.id,
        inviteCode: inviteData.code,
      }
    }, getServerUrl(), getServerKey())
    expect(serverInfo.projectId).toBeTruthy()
    expect(serverInfo.inviteCode).toBeTruthy()

    // ─── 4. Simulate Client 2: Join project via invite code ───
    const client2 = await browser.execute(async (serverUrl, projectId, inviteCode) => {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode, display_name: 'E2E-Client-2' }),
      })
      return await res.json()
    }, getServerUrl(), serverInfo.projectId, serverInfo.inviteCode)
    expect(client2.token).toBeTruthy()

    // ─── 5. Client 2: Fetch articles from server ───
    const articles = await browser.execute(async (serverUrl, projectId, token) => {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/articles`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      return await res.json()
    }, getServerUrl(), serverInfo.projectId, client2.token)
    expect(Array.isArray(articles)).toBe(true)
    expect(articles.length).toBeGreaterThan(0)

    const syncArticle = articles.find(a => a.title === 'Sync Test')
    expect(syncArticle).toBeTruthy()
    expect(syncArticle.content).toContain('Content from client one')

    // ─── 6. Client 2: Connect WebSocket and verify sync ───
    const wsCheck = await browser.execute(async (serverUrl, projectId, token, articleId) => {
      return new Promise((resolve) => {
        const wsBase = serverUrl.replace(/^http/, 'ws')
        const ws = new WebSocket(`${wsBase}/ws/${projectId}/${articleId}?token=${token}`)

        const timeout = setTimeout(() => {
          ws.close()
          resolve({ wsConnected: false, error: 'timeout' })
        }, 5000)

        ws.onopen = () => {
          ws.onmessage = (event) => {
            clearTimeout(timeout)
            ws.close()
            if (event.data instanceof ArrayBuffer) {
              resolve({ wsConnected: true, syncReceived: true, byteLength: event.data.byteLength })
            } else {
              resolve({ wsConnected: true, syncReceived: true })
            }
          }
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          resolve({ wsConnected: false, error: 'websocket error' })
        }
      })
    }, getServerUrl(), serverInfo.projectId, client2.token, syncArticle.id)
    expect(wsCheck.wsConnected).toBe(true)
    expect(wsCheck.syncReceived).toBe(true)

    // ─── 7. Verify server-side persistence ───
    const memberCheck = await browser.execute(async (serverUrl, projectId, serverKey) => {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/members`, {
        headers: { 'X-Server-Key': serverKey },
      })
      const members = await res.json()
      return {
        memberCount: Array.isArray(members) ? members.length : 0,
        clientIds: Array.isArray(members) ? members.map(m => m.client_id) : [],
      }
    }, getServerUrl(), serverInfo.projectId, getServerKey())
    expect(memberCheck.memberCount).toBeGreaterThanOrEqual(1)
  })
})
