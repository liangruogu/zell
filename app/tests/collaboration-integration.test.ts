/**
 * Real two-client integration test against the Go server.
 *
 * Starts (or connects to) the Go server, then simulates Owner and Member
 * making real HTTP API calls. No browser, no Tauri, no mocking — just fetch().
 *
 * Run: node --import tsx/esm tests/collaboration-integration.test.ts
 */

const BASE = 'http://localhost:3000'

interface TestResult { name: string; ok: boolean; error?: string }
const results: TestResult[] = []

async function assert(ok: boolean, msg: string) {
  if (ok) { results.push({ name: msg, ok: true }); console.log(`  ✓ ${msg}`) }
  else { results.push({ name: msg, ok: false }); console.log(`  ✗ ${msg}`); throw new Error(msg) }
}

function uid() { return crypto.randomUUID() }

async function main() {
  const ownerId = 'owner-' + uid().slice(0, 8)
  const memberId = 'member-' + uid().slice(0, 8)
  const projectId = uid()
  let serverKey = ''
  let inviteCode = ''
  let ownerJWT = ''
  let memberJWT = ''

  console.log('\n=== 双客户端协作集成测试 ===\n')

  // ── 1. Health check ──────────────────────────────────────────────
  console.log('1. 健康检查')
  const health = await fetch(`${BASE}/health`).then(r => r.json())
  await assert(health.status === 'ok', 'GET /health → ok')

  // ── 2. Owner: enable collaboration ───────────────────────────────
  console.log('\n2. Owner 开启协作')
  const enableRes = await fetch(`${BASE}/api/v1/projects/${projectId}/collab`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, owner_token: ownerId, name: 'E2E 测试项目' }),
  })
  if (enableRes.status !== 200) {
    // Server key required — check if already running with known key
    const body = await enableRes.json()
    await assert(false, `POST /collab → ${enableRes.status} ${JSON.stringify(body)}`)
    return
  }
  const enableData = await enableRes.json()
  serverKey = ''  // we don't have it yet
  inviteCode = enableData.invite_code
  ownerJWT = enableData.token
  await assert(!!inviteCode, 'invite_code 已生成')
  await assert(!!ownerJWT, 'owner JWT 已签发')

  // ── 3. Member: join project ──────────────────────────────────────
  console.log('\n3. Member 申请加入')
  const joinRes = await fetch(`${BASE}/api/v1/projects/${projectId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: inviteCode, client_id: memberId, display_name: 'TestMember' }),
  })
  const joinData = await joinRes.json()
  await assert(joinRes.status === 200, `POST /join → 200`)
  await assert(joinData.status === 'pending', `status = pending`)

  // ── 4. Owner: approve pending member ─────────────────────────────
  console.log('\n4. Owner 审批通过 (需要 serverKey)')
  // We need the serverKey. Since this is a test, try to read it from the
  // server log or use the default. In CI, pass via env var.
  const sk = process.env.ZELL_SERVER_KEY
  if (!sk) {
    console.log('  ⚠ ZELL_SERVER_KEY not set — skipping approval. Set it to run this step.')
    console.log('  The server key is printed on server startup.')
    // Try to use owner JWT as Bearer to fetch pending list
    const pendingRes = await fetch(`${BASE}/api/v1/projects/${projectId}/pending`, {
      headers: { 'X-Server-Key': sk || '', 'Authorization': sk ? '' : `Bearer ${ownerJWT}` },
    })
    if (pendingRes.status === 403) {
      console.log('  Server key required. Pass ZELL_SERVER_KEY env to test approval.')
    }
  } else {
    const approveRes = await fetch(`${BASE}/api/v1/projects/${projectId}/pending/${memberId}/approve`, {
      method: 'POST',
      headers: { 'X-Server-Key': sk },
    })
    const approveData = await approveRes.json()
    await assert(approveRes.status === 200, `POST /approve → 200`)
    memberJWT = approveData.token
    await assert(!!memberJWT, 'member JWT 已签发')
  }

  // ── 5. Owner: list articles ──────────────────────────────────────
  console.log('\n5. Owner 查看文章列表')
  const ownerArticles = await fetch(`${BASE}/api/v1/projects/${projectId}/articles`, {
    headers: { Authorization: `Bearer ${ownerJWT}` },
  })
  await assert(ownerArticles.status === 200 || ownerArticles.status === 403,
    `GET /articles (owner) → ${ownerArticles.status}`)

  // ── 6. Owner: create article ─────────────────────────────────────
  console.log('\n6. Owner 创建文章')
  const createRes = await fetch(`${BASE}/api/v1/projects/${projectId}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJWT}` },
    body: JSON.stringify({ id: uid(), title: '共享测试文章', content: '# Hello World', content_json: '{}' }),
  })
  await assert(createRes.status === 201, `POST /articles → 201`)

  // ── 7. Member: list articles (if approved) ───────────────────────
  if (memberJWT) {
    console.log('\n7. Member 查看文章列表')
    const memberArticles = await fetch(`${BASE}/api/v1/projects/${projectId}/articles`, {
      headers: { Authorization: `Bearer ${memberJWT}` },
    })
    const articles = await memberArticles.json()
    await assert(memberArticles.status === 200, `GET /articles (member) → 200`)
    await assert(articles.length > 0, `member 看到了 ${articles.length} 篇文章`)
  }

  // ── 8. Member: leave project ─────────────────────────────────────
  if (memberJWT) {
    console.log('\n8. Member 退出项目')
    const leaveRes = await fetch(`${BASE}/api/v1/projects/${projectId}/leave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberJWT}` },
    })
    await assert(leaveRes.status === 200, `POST /leave → 200`)
  }

  // ── 9. Owner: disable collaboration ──────────────────────────────
  if (sk) {
    console.log('\n9. Owner 关闭协作')
    const disableRes = await fetch(`${BASE}/api/v1/projects/${projectId}/collab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Server-Key': sk },
      body: JSON.stringify({ enabled: false }),
    })
    await assert(disableRes.status === 200, `POST /collab (disable) → 200`)
  }

  // ── Results ──────────────────────────────────────────────────────
  console.log('\n=== 结果 ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`通过: ${passed}, 失败: ${failed}`)
  if (failed > 0) {
    console.log('失败项:')
    results.filter(r => !r.ok).forEach(r => console.log(`  ${r.name}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('测试异常:', err.message)
  process.exit(1)
})
