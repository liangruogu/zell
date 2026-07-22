# Bindle Agent 设计文档

> 日期：2026-07-22
> 状态：设计完成，待实施

---

## 1. 设计目标

将 Bindle 内置 AI 从简单的对话助手升级为 **Agent**，具备工具调用能力，支持流式输出。Phase 1 聚焦知识库 Agent，后续扩展到白板 Agent 和外部资源 Agent。

### 1.1 当前问题

| 问题 | 根因 | 影响 |
|------|------|------|
| 流式输出不稳定 | 手写 SSE 解析（`fetch` + `ReadableStream` + 手动 `split('\n')`），网络分片/特殊字符易导致解析异常 | 用户体验差 |
| Tool calling 流程脆弱 | 先 streaming 获取 tool calls，流结束后再发非流式第二次请求拿结果。不支持多轮 tool use | 工具调用不可靠 |
| 无 Agent 架构 | 只有一个 `search_docs` 工具，工具、system prompt、消息管理全耦合在 `aiService.ts` 中 | 难以扩展 |
| 外部资源文本不可搜索 | FTS5 仅索引 `knowledge_articles`，`project_files.extracted_text` 和外部链接文本未被 AI 访问 | AI 上下文不完整 |

### 1.2 目标

- **稳定流式输出**：基于 Vercel AI SDK，消除手写 SSE 解析
- **可靠工具调用**：支持多轮 tool use 循环，自动处理 tool result → 模型推理 → 下一轮
- **工具化架构**：工具独立注册，Agent 按领域分离（知识库 / 白板 / 外部资源）
- **全数据源搜索**：外部资源提取文本纳入 AI 搜索范围

---

## 2. 技术选型：Vercel AI SDK

### 2.1 选型理由

| 对比维度 | Vercel AI SDK | LangChain/LangGraph | 自研 |
|----------|--------------|---------------------|------|
| 多 Provider 切换 | `@ai-sdk/openai` + `openai-compatible` 原生支持 OpenAI / Anthropic / Ollama | 支持但配置更重 | 需自行适配每种 API |
| 流式 + Tool Calling | `streamText()` 一行搞定，内置 tool call 循环 | `AgentExecutor` 或 Graph，配置复杂 | 极其脆弱 |
| 包体积 | ~80KB gzipped | ~500KB+ gzipped | 0 KB |
| 学习曲线 | 低，API 直观 | 中高 | 无需学习，但调试成本高 |
| 适应场景 | 对话 Agent + 工具调用（契合 Bindle 需求） | 复杂多步推理 + 条件分支 | 极简需求 |

**结论**：LangGraph 适合需要多步推理、条件分支、人工审批的复杂 Agent 工作流，对 Bindle 当前 "对话 + 搜索/读写文章" 场景过重。Vercel AI SDK 体积小、流式 + tool calling 开箱即用。

### 2.2 Provider 支持

```typescript
// 通过 openai-compatible 支持 OpenAI / Anthropic 兼容 API / Ollama / DeepSeek 等
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Ollama / 其他 openai-compatible 服务
const provider = createOpenAICompatible({
  name: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // required but unused
})
```

保持现有多 Provider 配置管理（`ai_providers` settings），Agent 运行时根据 `ai_active_provider` 动态选择。

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                     UI 层（小幅修改）                       │
│  AIPanel.tsx              WhiteboardPage.tsx (未来)       │
│  消息展示 + 工具状态展示    白板内 AI 交互                 │
├──────────────────────────────────────────────────────────┤
│                     Agent 层（新增）                       │
│                                                          │
│  AgentRunner (core/agentRunner.ts)                       │
│  ├── run(messages, agentConfig) → streamText()           │
│  ├── 统一管理：流式输出 + tool call 循环                   │
│  └── 多 Provider 路由                                    │
│                                                          │
│  KnowledgeAgent (agents/knowledgeAgent.ts)               │
│  ├── System prompt：知识库领域                            │
│  └── 工具集：search_knowledge, list_articles,             │
│      get_article, search_resources, get_resource,        │
│      get_project_context                                 │
│                                                          │
│  WhiteboardAgent (agents/whiteboardAgent.ts) [未来]      │
│  ├── System prompt：白板领域                              │
│  └── 工具集：create_shape, insert_text, generate_image    │
├──────────────────────────────────────────────────────────┤
│                     SDK 层（替换手写）                      │
│  Vercel AI SDK (ai + @ai-sdk/openai +                    │
│                 @ai-sdk/openai-compatible)               │
│  streamText({ model, messages, tools, system })          │
├──────────────────────────────────────────────────────────┤
│                     工具实现层（新增）                      │
│  tools/                                                   │
│  ├── searchKnowledge.ts    ──→ Tauri invoke search_knowledge│
│  ├── searchResources.ts    ──→ Tauri invoke search_resources│
│  ├── listArticles.ts       ──→ Tauri invoke get_knowledge_articles│
│  ├── getArticle.ts         ──→ Tauri invoke get_knowledge_article│
│  ├── getResource.ts        ──→ Tauri invoke get_resource_content│
│  └── getProjectContext.ts  ──→ Tauri invoke get_project│
├──────────────────────────────────────────────────────────┤
│                     Rust 后端层                            │
│  commands/resource.rs（新增 search_resources）             │
│  commands/knowledge.rs（修改 get_knowledge_articles）      │
│  db/migrations.rs（新增 FTS5 资源搜索虚拟表）               │
└──────────────────────────────────────────────────────────┘
```

---

## 4. 工具清单

### 4.1 Phase 1 工具（知识库 Agent）

| 工具名 | 输入参数 | 行为 | 返回值 |
|--------|---------|------|--------|
| **`get_project_context`** | 无 | 读取当前项目 name + background + status | `{ name: string, background: string, status: string }` |
| **`list_articles`** | 无 | 查询所有文章（不含全文），返回标题+预览 | `[{ id, title, preview, updated_at }]` |
| **`search_knowledge`** | `query: string` | FTS5 全文搜索 knowledge_articles | `[{ id, title, snippet, score }]` |
| **`search_resources`** | `query: string` | FTS5 搜索 project_files.extracted_text + external_links 文本 | `[{ id, name, type, snippet, score }]` |
| **`get_article`** | `id: string` | 返回单篇文章完整 Markdown 内容 | `{ id, title, content }` |
| **`get_resource`** | `id: string` | 返回单个资源的完整提取文本 | `{ id, name, text, type, url? }` |

### 4.2 工具设计原则

- **读优先**：Phase 1 只实现读操作，写操作（create/update article）在 Phase 2 加入
- **预览减轻上下文压力**：`list_articles` 返回 `preview`（内容前 300 字符，strip Markdown 后的纯文本），避免每次加载全文撑爆 context window。AI 根据 preview 判断相关性，按需调用 `get_article`
- **知识库与资源分离**：`search_knowledge` 和 `search_resources` 分开，AI 根据意图选择合适的搜索源

---

## 5. Rust 后端改动

### 5.1 新增命令

#### `search_resources(project_id: String, query: String, limit: u32) -> Vec<ResourceSearchResult>`

新建 FTS5 虚拟表 `resource_search`，联合索引：
- `project_files` 的 `original_name` + `extracted_text`
- `external_links` 的 `title` + `description` + `last_snapshot`

```rust
struct ResourceSearchResult {
    id: String,
    name: String,
    resource_type: String, // "file" | "link"
    snippet: String,
    score: f64,
}
```

#### `get_resource_content(resource_type: String, id: String) -> ResourceContent`

```rust
struct ResourceContent {
    id: String,
    name: String,
    text: String,
    resource_type: String,
    url: Option<String>, // external_links 的原 URL
}
```

### 5.2 修改现有命令

#### `get_knowledge_articles` 增加 `preview` 字段

```rust
struct KnowledgeArticleListItem {
    id: String,
    title: String,
    preview: String,  // 新增：content 前 300 字符（去除 Markdown 标记后）
    updated_at: String,
    sort_order: i32,
}
```

`preview` 生成逻辑（Rust 端）：取 `content` → strip Markdown 标记（`#`、`*`、`**`、`[]()`、`` ` `` 等）→ 截取前 300 个 Unicode 字符。

### 5.3 数据库迁移

新增 migration：

```sql
-- 资源全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS resource_search USING fts5(
    resource_id,
    resource_type,    -- 'file' | 'link'
    project_id UNINDEXED,
    name,
    text_content,     -- extracted_text (files) or description + last_snapshot (links)
    tokenize='unicode61'
);
```

数据填充：已有 `project_files.extracted_text` 和 `external_links` 的文本字段通过触发器或应用层同步到 FTS5 表。

### 5.4 注册到 Tauri invoke_handler

在 `lib.rs` 中新增：
```rust
commands::resource::search_resources,
commands::resource::get_resource_content,
```

---

## 6. 前端改动

### 6.1 新增依赖

```json
{
  "ai": "^4.x",
  "@ai-sdk/openai": "^1.x",
  "@ai-sdk/openai-compatible": "^0.x"
}
```

### 6.2 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/aiService.ts` | **重写** | 移除手写 SSE，改为基于 Vercel AI SDK |
| `services/core/agentRunner.ts` | **新增** | 统一 Agent 运行器：创建 Provider、调用 streamText、处理 tool calls |
| `services/agents/knowledgeAgent.ts` | **新增** | KnowledgeAgent 配置：system prompt + tools 数组 |
| `services/tools/searchKnowledge.ts` | **新增** | search_knowledge 工具实现 |
| `services/tools/searchResources.ts` | **新增** | search_resources 工具实现 |
| `services/tools/listArticles.ts` | **新增** | list_articles 工具实现 |
| `services/tools/getArticle.ts` | **新增** | get_article 工具实现 |
| `services/tools/getResource.ts` | **新增** | get_resource 工具实现 |
| `services/tools/getProjectContext.ts` | **新增** | get_project_context 工具实现 |
| `services/tools/index.ts` | **新增** | 工具注册表 |
| `stores/aiStore.ts` | **修改** | 消息类型增加 tool call 相关字段 |
| `components/editor/AIPanel.tsx` | **修改** | 展示工具调用状态 + tool result |
| `types/ai.ts` | **修改** | 更新类型定义 |

### 6.3 AgentRunner 核心流程

```typescript
// services/core/agentRunner.ts
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export async function runAgent(messages: Message[], agentConfig: AgentConfig) {
  const provider = resolveProvider() // 根据 settings 中的 ai_active_provider 选择

  const result = streamText({
    model: provider(agentConfig.model),
    system: agentConfig.systemPrompt,
    messages: agentConfig.prepareMessages(messages),
    tools: agentConfig.tools,
    maxSteps: 5,       // 最多 5 轮 tool call（防止无限循环）
    onStepFinish: (event) => {
      // 更新 UI：显示工具调用状态
      if (event.toolResults) {
        updateToolCallStatus(event.toolResults)
      }
    },
  })

  // 流式输出到 UI
  for await (const chunk of result.textStream) {
    appendToMessage(chunk)
  }
}
```

### 6.4 KnowledgeAgent System Prompt

```
你是一个项目知识库助手，运行在 Bindle 应用中。
你有以下能力：
- 搜索知识库文章（search_knowledge）
- 浏览所有文章列表（list_articles）
- 读取完整文章内容（get_article）
- 搜索外部资源：PDF、Word、PPT、网页提取文本（search_resources）
- 获取外部资源详细内容（get_resource）
- 了解项目背景信息（get_project_context）

使用原则：
1. 用户提问时，先用 get_project_context 了解项目背景
2. 需要查找信息时，优先用 search_knowledge 搜索知识库
3. 如果知识库没找到，可以尝试 search_resources 搜索外部资源
4. 拿到搜索结果后，根据 snippet 判断是否需要 get_article/get_resource 获取完整内容
5. 回答时引用具体来源（文章标题、资源名称）
6. 用中文回答，简洁准确
```

### 6.5 aiStore 消息类型更新

```typescript
interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: ToolInvocationPart[]  // 新增：工具调用和结果
}

interface ToolInvocationPart {
  type: 'tool-invocation'
  toolInvocation: {
    toolCallId: string
    toolName: string
    state: 'call' | 'result'
    args?: Record<string, unknown>
    result?: unknown
  }
}
```

### 6.6 AIPanel 工具状态展示

当 AI 正在调用工具时，在消息区显示中间状态：

```
🔍 正在搜索知识库: "项目背景"...
✅ 找到 3 篇相关文章
🤖 AI 正在生成回答...
```

Vercel AI SDK 的 `onStepFinish` 回调提供工具执行步骤信息，可用于更新 UI。

---

## 7. 数据流

### 7.1 用户提问完整流程

```
用户: "这个项目的技术栈是什么？"
    ↓
AIPanel: 添加 user message → 调用 agentRunner.run()
    ↓
AgentRunner: 选择 KnowledgeAgent → 构建 provider → streamText()
    ↓
Step 1: 模型决定调用 get_project_context()
    ↓ 工具返回 { name: "Bindle", background: "Tauri + React...", ... }
Step 2: 模型基于项目背景，决定调用 search_knowledge("技术栈")
    ↓ 工具返回 [3 篇文章的 snippet]
Step 3: 模型基于搜索结果，决定调用 get_article(id) 获取最相关文章全文
    ↓ 工具返回完整 Markdown 内容
Step 4: 模型综合所有信息，流式生成最终回答
    ↓
AIPanel: 流式展示 LLM 输出 → 完成
```

### 7.2 文章预览流程

```
AI 调用 list_articles()
    ↓
Rust: SELECT id, title, substr(content, 1, 300) as preview FROM knowledge_articles
    ↓
返回 [{id, title: "技术架构", preview: "Bindle 基于 Tauri 2.x 和 React 19...", updated_at: "..."}]
    ↓
AI 判断 preview 中包含 "Tauri" "React" → 决定调用 get_article(id)
    ↓
获取完整文章内容，生成准确回答
```

---

## 8. 错误处理

| 场景 | 处理方式 |
|------|---------|
| Provider 请求失败（网络/API 错误） | streamText 抛出异常，捕获后在后端消息中显示错误，停止 streaming |
| 工具执行失败（Tauri invoke 错误） | 工具返回 `{ error: string }` 作为 tool result，让模型决定下一步 |
| 工具返回空结果 | 返回 `"未找到相关内容"` 字符串，模型据此告知用户 |
| 多轮 tool call 超过 maxSteps | 模型强制生成最终回答（SDK 内置行为） |
| 用户中途发送新消息 | 取消前一个 streamText（AbortController） |
| Provider 配置缺失 | AgentRunner 检查后返回友好错误，提示配置 AI 服务 |

---

## 9. 测试策略

| 测试层 | 内容 | 工具 |
|--------|------|------|
| 工具单元测试 | 每个工具函数独立测试：模拟 Tauri invoke 返回值 | Vitest |
| AgentRunner 单元测试 | 模拟 Provider 响应，验证 tool call 循环和消息格式 | Vitest |
| 集成测试 | 端到端：发送消息 → 验证流式输出 + 工具调用 UI 状态 | Vitest + React Testing Library |
| 手动测试 | 连接真实 LLM，验证实际对话体验 | 开发环境 |

---

## 10. 未来扩展

### Phase 2：写操作 + 白板 Agent

- 知识库工具新增：`create_article`, `update_article`
- 白板 Agent：独立的 system prompt + `create_shape`, `insert_text`, `generate_image` 工具

### Phase 3：外部资源 Agent

- 工具：`sync_github`, `fetch_webpage`, `search_canva`
- 支持 Canva Connect API 读取设计内容

---

## 11. 实施约束

- **向后兼容**：现有 `ai_providers` / `ai_active_provider` settings 格式不变
- **AIPanel 组件**：保留现有 UI 结构（Provider 切换、引用条、消息编辑/删除），仅增加工具状态展示
- **不引入新的 Rust 依赖**：仅使用已有的 `rusqlite` FTS5 能力

---

## 12. 实施顺序

1. 安装 Vercel AI SDK 依赖
2. Rust 端：新增 `search_resources` + `get_resource_content` 命令，修改 `get_knowledge_articles` 增加 preview
3. 前端：创建 `agentRunner.ts` + `knowledgeAgent.ts` + 6 个工具文件
4. 重写 `aiService.ts`：替换为 AgentRunner 调用
5. 修改 `aiStore.ts` + `types/ai.ts`：支持工具调用消息格式
6. 修改 `AIPanel.tsx`：展示工具调用中间状态
7. 测试：手动测试流式输出 + 工具调用，验证稳定性
