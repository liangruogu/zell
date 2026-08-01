
const LOG_FILE = 'zell-app.log'

const logs: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function formatLine(level: string, message: string, error?: unknown): string {
  const ts = new Date().toISOString()
  const parts = [`[${ts}]`, level, message]
  if (error instanceof Error) {
    parts.push(error.message)
    if (error.stack) parts.push(error.stack)
  } else if (error !== undefined) {
    parts.push(String(error))
  }
  return parts.join(' ')
}

async function flush(): Promise<void> {
  if (logs.length === 0) return
  const content = logs.join('\n') + '\n'
  logs.length = 0
  try {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(LOG_FILE, content, {
      append: true,
      baseDir: BaseDirectory.AppData,
    })
  } catch {
    // cannot log file write failures
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, 1000)
}

function write(level: string, message: string, error?: unknown): void {
  const line = formatLine(level, message, error)
  console.error(line)
  logs.push(line)
  scheduleFlush()
}

export const logger = {
  error: (message: string, error?: unknown) => write('ERROR', message, error),
  warn: (message: string, error?: unknown) => write('WARN', message, error),
  info: (message: string) => write('INFO', message),
  debug: (message: string) => write('DEBUG', message),
}
