/**
 * Agent 运行时测试 — 模拟真实 Zell 调用链
 * 运行: npx tsx test/agent-test.ts
 */
import { ChatOpenAI } from '@langchain/openai'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'

// ── 模拟 Zell 配置 ────────────────────────────────────────────────
const PROVIDER = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-a1704ab9ca5c4146851415fc7b11af7f',
  model: 'deepseek-chat',
}

// ── 模拟工具（和 Zell 知识库一样） ─────────────────────────────────
const getProjectContext = tool(
  async () => JSON.stringify({ name: 'TestProject', background: '测试用', status: 'sprint' }),
  { name: 'get_project_context', description: '获取当前项目信息' }
)

const searchDocs = tool(
  async ({ query }: { query: string }) => {
    if (query.includes('Zig')) return 'Zig 是系统编程语言，无 GC，编译时计算，交叉编译简单。'
    return `未找到 "${query}"`
  },
  { name: 'search_knowledge', description: '搜索知识库', schema: z.object({ query: z.string() }) }
)

const listArticles = tool(
  async () => JSON.stringify([{ id: '1', title: '技术架构', preview: 'Zell 基于 Tauri...' }]),
  { name: 'list_articles', description: '列出所有文章' }
)

const SYSTEM_PROMPT = '你是项目知识库助手。用中文简洁回答。'

// ── 核心调用函数（模拟 agentRunner） ─────────────────────────────────
async function chat(
  llm: ChatOpenAI,
  tools: ReturnType<typeof tool>[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onToken: (t: string) => void,
  onToolCall?: (name: string, args: any) => void,
) {
  const llmWithTools = llm.bindTools(tools)

  // 构建消息列表
  const msgs: (SystemMessage | HumanMessage | AIMessage)[] = [new SystemMessage(SYSTEM_PROMPT)]
  for (const m of history) {
    msgs.push(m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))
  }

  for (let round = 0; round < 5; round++) {
    // 流式调用
    const stream = await llmWithTools.stream(msgs)
    let content = ''
    const tcBuf = new Map<number, { id: string; name: string; args: string }>()

    for await (const chunk of stream) {
      const text = getChunkText(chunk)
      if (text) { content += text; onToken(text) }

      const tccs = (chunk as any).tool_call_chunks
      if (tccs) {
        for (const tc of tccs) {
          const idx = tc.index ?? 0
          const e = tcBuf.get(idx) || { id: '', name: '', args: '' }
          if (tc.id) e.id = tc.id
          if (tc.name) e.name += tc.name
          if (tc.args) e.args += tc.args
          tcBuf.set(idx, e)
        }
      }
    }

    const toolCalls = [...tcBuf.values()].filter(tc => tc.id)
    if (toolCalls.length === 0) return // 无工具调用，结束

    // 添加 AI 消息 + 执行工具
    const aiMsg = new AIMessage({
      content: content || '',
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        args: JSON.parse(tc.args || '{}'),
      })),
    })
    msgs.push(aiMsg)

    for (const tc of toolCalls) {
      let args: any = {}
      try { args = JSON.parse(tc.args) } catch { /* */ }
      onToolCall?.(tc.name, args)

      const matched = tools.find(t => t.name === tc.name)
      const result = matched ? await matched.invoke(args) : 'Tool not found'

      msgs.push({
        role: 'tool' as any,
        content: String(result),
        tool_call_id: tc.id,
        name: tc.name,
      } as any)
    }
  }
}

function getChunkText(c: any): string {
  if (typeof c.content === 'string') return c.content
  if (Array.isArray(c.content)) return c.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  return ''
}

// ── 测试 ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`测试: ${PROVIDER.baseUrl} | ${PROVIDER.model}\n`)

  const llm = new ChatOpenAI({
    model: PROVIDER.model,
    apiKey: PROVIDER.apiKey,
    configuration: { baseURL: PROVIDER.baseUrl },
    temperature: 0.7,
    streaming: true,
  })

  // 测试 1: 简单对话
  console.log('=== 测试 1: 简单对话 ===')
  await chat(llm, [], [{ role: 'user', content: '你好' }], t => process.stdout.write(t))
  console.log()

  // 测试 2: 工具调用
  console.log('\n=== 测试 2: 搜索工具调用 ===')
  await chat(
    llm,
    [searchDocs, getProjectContext, listArticles],
    [{ role: 'user', content: 'Zig 语言是什么？' }],
    t => process.stdout.write(t),
    (name, args) => console.log(`  🔧 ${name}(${JSON.stringify(args)})`)
  )
  console.log()

  // 测试 3: 多轮对话
  console.log('\n=== 测试 3: 多轮对话 ===')
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: '项目里有什么文档？' },
  ]
  let ai1 = ''
  await chat(llm, [listArticles, searchDocs], history, t => { ai1 += t; process.stdout.write(t) })
  history.push({ role: 'assistant', content: ai1 })
  console.log()

  history.push({ role: 'user', content: '这篇文章讲了什么技术？' })
  await chat(llm, [listArticles, searchDocs], history, t => process.stdout.write(t))
  console.log()

  console.log('\n✅ 全部测试通过')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
