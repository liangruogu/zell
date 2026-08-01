interface HeadingNode {
  level: number
  text: string
  line: number
  children: HeadingNode[]
}

export function parseHeadingTree(markdown: string): HeadingNode[] {
  const lines = markdown.split('\n')
  const flat: { level: number; text: string; line: number }[] = []

  lines.forEach((line, i) => {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (!match) return
    let text = match[2].trim()
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/!\[.+?\]\(.+?\)/g, '')
      .replace(/^>\s*/, '')
    flat.push({ level: match[1].length, text, line: i })
  })

  return buildTree(flat)
}

function buildTree(items: { level: number; text: string; line: number }[]): HeadingNode[] {
  const root: HeadingNode[] = []
  const stack: HeadingNode[] = []

  for (const item of items) {
    const node: HeadingNode = { ...item, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop()
    if (stack.length === 0) root.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return root
}
