/**
 * LangGraph Agent 测试文件
 * 测试: 多轮对话 + 工具调用 + 流式输出
 *
 * 运行: npx tsx test/agent-test.ts
 */

import { ChatOpenAI } from '@langchain/openai'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'

// ── 配置（模拟 Bindle 的 AI 配置） ─────────────────────────────────
const CONFIG = {
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-a1704ab9ca5c4146851415fc7b11af7f',
  model: 'deepseek-chat',
}

// ── 模拟工具 ────────────────────────────────────────────────────────
const searchDocs = tool(
  async ({ query }: { query: string }) => {
    console.log('  [tool] searchDocs:', query)
    if (query.includes('Zig') || query.includes('zig')) {
      return 'Zig 是一种系统编程语言，设计目标是取代 C 语言。特点：无 GC、编译时计算、交叉编译简单。'
    }
    return `未找到关于 "${query}" 的文档。`
  },
  { name: 'search_docs', description: '搜索文档库', schema: z.object({ query: z.string() }) }
)

const getWeather = tool(
  async ({ city }: { city: string }) => {
    console.log('  [tool] getWeather:', city)
    return JSON.stringify({ city, temp: 22, condition: '晴天', humidity: 45 })
  },
  { name: 'get_weather', description: '获取天气', schema: z.object({ city: z.string() }) }
)

async function createAgent() {
  const llm = new ChatOpenAI({
    model: CONFIG.model,
    apiKey: CONFIG.apiKey,
    configuration: { baseURL: CONFIG.baseURL },
    temperature: 0.7,
  })

  return createReactAgent({
    llm,
    tools: [searchDocs, getWeather],
    messageModifier: new SystemMessage('你是一个测试助手。用中文回答，简洁准确。'),
    checkpointSaver: new MemorySaver(),
  })
}

// ── 输出辅助 ────────────────────────────────────────────────────────
function textOf(msg: any): string {
  if (!msg) return ''
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  }
  return ''
}

// ── 测试 1: 基本对话 ────────────────────────────────────────────────
async function test1(agent: Awaited<ReturnType<typeof createAgent>>) {
  console.log('\n=== 测试 1: 基本对话 ===')
  const stream = await agent.stream(
    { messages: [new HumanMessage('你好')] },
    { configurable: { thread_id: 't1' }, streamMode: 'values' }
  )
  for await (const chunk of stream) {
    const last = (chunk as any).messages?.at(-1)
    if (last?.content) process.stdout.write(textOf(last))
  }
  console.log()
}

// ── 测试 2: 工具调用 ────────────────────────────────────────────────
async function test2(agent: Awaited<ReturnType<typeof createAgent>>) {
  console.log('\n=== 测试 2: 工具调用 ===')
  const stream = await agent.stream(
    { messages: [new HumanMessage('Zig 语言是什么？')] },
    { configurable: { thread_id: 't2' }, streamMode: 'values' }
  )
  for await (const chunk of stream) {
    const msgs = (chunk as any).messages
    if (msgs?.length) {
      const last = msgs[msgs.length - 1]
      if (last.tool_calls?.length) {
        for (const tc of last.tool_calls) console.log(`  🔧 ${tc.name}(${JSON.stringify(tc.args)})`)
      }
      if (last.content) process.stdout.write(textOf(last))
    }
  }
  console.log()
}

// ── 测试 3: 多轮对话 ────────────────────────────────────────────────
async function test3(agent: Awaited<ReturnType<typeof createAgent>>) {
  console.log('\n=== 测试 3: 多轮对话（同一 thread） ===')

  console.log('  > 北京天气？')
  const s1 = await agent.stream(
    { messages: [new HumanMessage('北京天气？')] },
    { configurable: { thread_id: 't3' }, streamMode: 'values' }
  )
  for await (const c of s1) {
    const last = (c as any).messages?.at(-1)
    if (last?.content) process.stdout.write('  ' + textOf(last))
  }
  console.log()

  console.log('  > 适合出门吗？')
  const s2 = await agent.stream(
    { messages: [new HumanMessage('适合出门吗？')] },
    { configurable: { thread_id: 't3' }, streamMode: 'values' }
  )
  for await (const c of s2) {
    const last = (c as any).messages?.at(-1)
    if (last?.content) process.stdout.write('  ' + textOf(last))
  }
  console.log()
}

// ── 测试 4: 流式 Token ──────────────────────────────────────────────
async function test4(agent: Awaited<ReturnType<typeof createAgent>>) {
  console.log('\n=== 测试 4: 流式 Token (messages mode) ===')
  const stream = await agent.stream(
    { messages: [new HumanMessage('用一句话介绍 Rust')] },
    { configurable: { thread_id: 't4' }, streamMode: 'messages' }
  )
  for await (const [msg, _] of stream) {
    if (msg.content) {
      const t = typeof msg.content === 'string' ? msg.content : ''
      if (t) process.stdout.write(t)
    }
  }
  console.log()
}

// ── 主函数 ───────────────────────────────────────────────────────────
async function main() {
  console.log(`LangGraph Agent Test | ${CONFIG.baseURL} | ${CONFIG.model}`)
  const agent = await createAgent()
  await test1(agent)
  await test2(agent)
  await test3(agent)
  await test4(agent)
  console.log('\n✅ 全部测试完成')
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})
