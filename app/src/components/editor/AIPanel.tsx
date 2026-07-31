import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAIStore } from '@/stores/aiStore'
import { sendMessage, getProviders, getActiveProviderId } from '@/services/aiService'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { markdownToHtml } from '@/lib/markdown'
import { useProjectStore } from '@/stores/projectStore'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)

function renderMarkdown(content: string): string {
  const html = markdownToHtml(content)
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('pre code').forEach((block) => {
    // Code fence content always ends with \n —trim it visually
    if (block.lastChild?.nodeType === Node.TEXT_NODE) {
      const t = block.lastChild as Text
      t.textContent = t.textContent?.replace(/\n+$/, '') ?? ''
    } else if (block.childNodes.length > 0) {
      // hljs may have already run —check all text nodes
      block.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child as Text
          t.textContent = t.textContent?.replace(/\n+$/, '') ?? ''
        }
      })
    }
    try {
      hljs.highlightElement(block as HTMLElement)
    } catch (e) { logger.error('AIPanel: failed to highlight code block', e); /* unsupported language */ }
  })
  return div.innerHTML
}
import { X, Send, Sparkles, AlertCircle, ChevronDown, Trash2, Pencil, Plus, MessageSquare, Square } from 'lucide-react'

export function AIPanel() {
  const { isOpen, messages, streaming, selectedText, closePanel, deleteMessagePair, truncateMessages, updateMessage, pendingInput, setPendingInput, conversations, activeConversationId, loadConversations, createConversation, switchConversation, deleteConversation } = useAIStore()
  const project = useProjectStore((s) => s.currentProject)
  const [showProviders, setShowProviders] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
  const [showConvList, setShowConvList] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const providers = useMemo(() => getProviders(), [useSettingsStore((s) => s.settings['ai_providers'])])
  const activeId = useMemo(() => getActiveProviderId(), [useSettingsStore((s) => s.settings['ai_active_provider'])])
  const activeProvider = providers.find((p) => p.id === activeId) || providers[0] || null
  const setSetting = useSettingsStore((s) => s.setSetting)

  const hasAI = providers.length > 0

  const handleSwitchProvider = async (id: string) => {
    await setSetting('ai_active_provider', id)
    setShowProviders(false)
  }

  // Auto-scroll: only scroll if already near bottom
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Focus input on open
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Load conversations when panel opens or project changes
  useEffect(() => {
    if (isOpen && project) {
      loadConversations(project.id)
    }
  }, [isOpen, project?.id, loadConversations])

  const handleSend = useCallback(async () => {
    const text = pendingInput.trim()
    if (!text || streaming || !hasAI) return
    setPendingInput('')
    await sendMessage(text)
  }, [pendingInput, streaming, hasAI])

  const handleStop = useCallback(() => {
    useAIStore.getState().abortController?.abort()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleDelete = (index: number) => {
    setDeleteConfirmIdx(index)
  }

  const confirmDelete = () => {
    if (deleteConfirmIdx !== null) {
      deleteMessagePair(deleteConfirmIdx)
      setDeleteConfirmIdx(null)
    }
  }

  // Token estimation: ~1.5 chars per token for mixed zh/en
  const estimateTokens = useMemo(() => {
    const SYSTEM_BASE = 800 // rough estimate for system prompt + tools + context
    let chars = SYSTEM_BASE * 1.5
    for (const m of messages) chars += m.content.length
    return Math.ceil(chars / 1.5)
  }, [messages])

  // Default context window sizes by model family
  const TOKEN_LIMIT = useMemo(() => {
    const model = activeProvider?.model?.toLowerCase() || ''
    if (model.includes('deepseek')) return 1000000  // 1M
    if (model.includes('gpt-4')) return 128000
    if (model.includes('gpt-3.5')) return 16385
    if (model.includes('claude')) return 200000
    return 65536
  }, [activeProvider])
  const tokenPct = Math.min(100, Math.round((estimateTokens / TOKEN_LIMIT) * 100))

  const handleEdit = (index: number, content: string) => {
    setEditingIndex(index)
    setEditText(content)
  }

  const handleEditSend = async () => {
    if (!editText.trim() || streaming) return
    const idx = editingIndex
    if (idx === null) return
    truncateMessages(idx)
    setEditingIndex(null)
    setEditText('')
    await sendMessage(editText.trim())
  }

  const handleRegenerate = async (index: number) => {
    if (streaming) return
    // index is the assistant message; find the user message before it
    if (index < 1) return
    const userMsg = messages[index - 1]
    if (userMsg.role !== 'user') return
    truncateMessages(index)
    await sendMessage(userMsg.content)
  }

  if (!isOpen) return null

  return (
    <div className="border-l border-gray-200 bg-white flex flex-col h-full">

      {/* Header + conversation bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 shrink-0 relative">
        <button
          onClick={() => setShowConvList(!showConvList)}
          className="flex items-center gap-1 flex-1 text-xs text-gray-600 hover:text-zell-600 py-1"
        >
          <MessageSquare size={12} />
          <span className="truncate">
            {activeConversationId
              ? (conversations.find(c => c.id === activeConversationId)?.title || '对话')
              : '新对话'}
          </span>
          <ChevronDown size={10} />
        </button>
        {project && (
          <button
            onClick={async () => {
              const srcType = useAIStore.getState().sourceType || 'knowledge'
              await createConversation(project.id, srcType)
            }}
            className="p-1 text-gray-400 hover:text-zell-600 rounded"
            title="新建对话"
          >
            <Plus size={14} />
          </button>
        )}

        {/* Token ring */}
        <div className="relative w-4 h-4 group/token cursor-pointer shrink-0">
          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="12" cy="12" r="9" fill="none"
              stroke={tokenPct > 80 ? '#ef4444' : tokenPct > 50 ? '#f59e0b' : '#22c55e'}
              strokeWidth="3"
              strokeDasharray={`${tokenPct * 0.565} 56.5`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute right-0 top-full mt-1.5 hidden group-hover/token:block z-20">
            <div className="bg-white border border-gray-200 text-gray-600 text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap shadow leading-relaxed">
              <div>已用 {tokenPct}%</div>
              <div className="text-gray-400">{estimateTokens.toLocaleString()} / {TOKEN_LIMIT.toLocaleString()} tokens</div>
            </div>
          </div>
        </div>

        <button
          onClick={closePanel}
          className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
        >
          <X size={14} />
        </button>

        {showConvList && (
          <div className="absolute left-3 right-3 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
            {conversations.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">暂无历史对话</p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-gray-50',
                    activeConversationId === c.id && 'bg-zell-50',
                  )}
                  onClick={() => { switchConversation(c.id); setShowConvList(false) }}
                >
                  <span className="truncate flex-1">
                    {c.title || new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(c.id)
                    }}
                    className="p-0.5 text-gray-400 hover:text-red-500 rounded ml-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {!hasAI && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>请在设置中配置AI 服务（API Key 或Ollama）</span>
          </div>
        )}

        {messages.length === 0 && hasAI && (
          <div className="text-center text-sm text-gray-400 py-8 px-4">
            <Sparkles size={32} strokeWidth={1} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium mb-2">我能帮你做什么？</p>
            <div className="text-xs space-y-1 text-gray-400">
              <p>🔍 搜索知识库和外部资源</p>
              <p>📖 读取文章和文件完整内容</p>
              <p>💡 基于项目上下文回答问题</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="group relative">
            {editingIndex === i ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full resize-none px-3 py-2 text-sm border border-zell-300 rounded-lg focus:outline-none"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button onClick={handleEditSend} className="px-3 py-1 text-xs bg-zell-500 text-white rounded">发送</button>
                  <button onClick={() => setEditingIndex(null)} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">取消</button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    'text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-zell-50 text-gray-800 rounded-lg px-3 py-2'
                      : 'text-gray-700 px-1 prose prose-sm max-w-none',
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none [&_pre]:text-sm [&_code]:text-sm max-w-3xl mx-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                </div>
                {/* Hover actions */}
                <div className={cn(
                  'absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm px-0.5 py-0.5',
                  msg.role === 'assistant' && 'top-1 right-8',
                )}>
                  {msg.role === 'user' && (
                    <button onClick={() => handleEdit(i, msg.content)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="编辑">
                      <Pencil size={13} />
                    </button>
                  )}
                  {msg.role === 'user' && (
                    deleteConfirmIdx === i ? (
                      <div className="absolute top-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg px-2 py-1.5 flex items-center gap-1.5 z-10">
                        <span className="text-[10px] text-gray-500">删除这条对话？</span>
                        <button onClick={confirmDelete} className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600">确认</button>
                        <button onClick={() => setDeleteConfirmIdx(null)} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded hover:bg-gray-200">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => handleDelete(i)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="删除">
                        <Trash2 size={13} />
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 text-gray-400 text-sm px-1 py-1">
            <Sparkles size={14} className="animate-pulse text-zell-400" />
            <span>AI 思考中...</span>
          </div>
        )}
      </div>

      {/* Referenced text bar (WeChat-style, above input) */}
      {selectedText && (
        <div className="px-4 py-2 border-t border-gray-100 shrink-0 flex items-start gap-2">
          <div className="w-0.5 self-stretch bg-zell-400 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-2">{selectedText}</p>
          </div>
          <button onClick={() => useAIStore.getState().setSelectedText('')} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        <div className="flex items-end gap-2">
          {/* Model selector (icon only) */}
          {activeProvider ? (
            <div className="relative shrink-0 self-center">
              <button
                onClick={() => setShowProviders(!showProviders)}
                className="p-1.5 text-gray-400 hover:text-zell-600 border border-gray-200 rounded-lg hover:border-zell-300 self-center"
                title={activeProvider.name || activeProvider.model}
              >
                <Sparkles size={14} />
              </button>
              {showProviders && (
                <div className="absolute bottom-full left-0 mb-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchProvider(p.id)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50',
                        (activeId === p.id || (!activeId && p === providers[0])) && 'bg-zell-50 text-zell-700 font-medium',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        {p.name || p.model}
                        {(activeId === p.id || (!activeId && p === providers[0])) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-zell-500" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <textarea
            ref={inputRef}
            value={pendingInput}
            onChange={(e) => setPendingInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，Enter 发送.."
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zell-400"
            disabled={streaming}
          />
          <button
            onClick={streaming ? handleStop : handleSend}
            disabled={!streaming && (!pendingInput.trim() || !hasAI)}
            className={cn(
              'p-1.5 rounded transition-colors self-center',
              streaming
                ? 'bg-red-500 text-white hover:bg-red-600'
                : pendingInput.trim() && hasAI
                  ? 'bg-zell-500 text-white hover:bg-zell-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            {streaming ? <Square size={14} /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
