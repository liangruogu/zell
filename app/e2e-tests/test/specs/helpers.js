// Shared helpers for Zell e2e tests

/** Get server key (auto-parsed from server stdout by wdio.conf.js) */
export function getServerKey() { return global.zellServerKey || '' }
export function getServerUrl() { return global.zellServerUrl || 'http://127.0.0.1:3000' }
export function killServer() { global.killServer?.() }
export function startServer() { global.startServer?.() }

export async function waitForApp() {
  await browser.pause(6000)
  await expect($('body')).toBePresent()
}

export async function clickButton(text) {
  const found = await browser.execute((t) => {
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if ((el.textContent || '').includes(t)) { el.click(); return true }
    }
    return false
  }, text)
  if (!found) throw new Error(`Button "${text}" not found`)
  await browser.pause(800)
}

export async function fillInput(placeholder, value) {
  await browser.pause(300)
  await browser.execute((p, v) => {
    for (const el of document.querySelectorAll('input')) {
      if ((el.placeholder || '').includes(p)) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }
    }
  }, placeholder, value)
  await browser.pause(200)
}

export async function createProject(name) {
  await clickButton('新建项目')
  await fillInput('项目名称', name)
  await clickButton('创建')
  await browser.pause(1500)
}

export async function openKnowledgeTab() {
  await browser.pause(300)
  // Navigate via sidebar link — knowledge base is at /project/:id/knowledge
  await browser.execute(() => {
    const links = document.querySelectorAll('a[href*="/knowledge"]')
    for (const link of links) {
      link.click()
      return
    }
  })
  await browser.pause(1000)
}

export async function createArticle(title) {
  await clickButton('新建文章')
  await fillInput('文章标题', title)
  await browser.keys('Enter')
  await browser.pause(800)
}

export async function selectArticle(title) {
  await browser.pause(300)
  await browser.execute((t) => {
    for (const s of document.querySelectorAll('span')) {
      if (s.textContent?.trim() === t) {
        const row = s.closest('[class*="group"]') || s.parentElement
        if (row) row.click()
        return
      }
    }
  }, title)
  await browser.pause(800)
}

export async function typeInEditor(text) {
  await browser.pause(500)
  const editor = await $('.ProseMirror')
  await editor.waitForExist({ timeout: 5000 })
  await editor.click()
  await browser.pause(200)
  for (const ch of text) {
    await browser.keys(ch === '\n' ? 'Enter' : ch)
  }
  await browser.pause(500)
}

/** Insert content via editor commands (bypasses markdown parsing) */
export async function setEditorContent(json) {
  await browser.execute((j) => {
    const el = document.querySelector('.ProseMirror')
    if (el && el.__vue_app__) {
      // Access TipTap editor via Vue internals or a global
      // Fallback: set innerHTML directly
    }
    // Direct DOM manipulation as fallback
    const content = typeof j === 'string' ? j : JSON.stringify(j)
  }, json)
}
