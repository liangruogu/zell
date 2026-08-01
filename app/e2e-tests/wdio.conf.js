import os from 'os'
import path from 'path'
import { spawn, spawnSync, execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
let tauriDriver
let exit = false
let serverProc = null
let serverKey = ''

export const config = {
  host: '127.0.0.1',
  port: 4444,
  specs: ['./test/specs/**/*.js'],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: path.resolve(__dirname, '..', 'src-tauri', 'target', 'debug', 'zell'),
      },
    },
  ],
  reporters: ['spec'],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  onPrepare: () => {
    // Start Go collaboration server
    const serverDir = path.resolve(__dirname, '..', '..', 'server')
    try {
      execSync('go build -o zell-server .', { cwd: serverDir })
    } catch { /* binary may exist */ }

    serverProc = spawn(path.resolve(serverDir, 'zell-server'), [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ZELL_DATA_DIR: '/tmp/zell-e2e-server' },
    })

    // Parse server key from stdout
    const keyRegex = /^\s*([0-9a-f]{32})\s*$/
    serverProc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        const match = line.match(keyRegex)
        if (match) serverKey = match[1]
      }
    })
    serverProc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        const match = line.match(keyRegex)
        if (match) serverKey = match[1]
      }
    })

    // Wait for server to be ready
    spawnSync('sleep', ['2'])
  },

  beforeSession: () => {
    tauriDriver = spawn(
      path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'),
      [],
      { stdio: [null, process.stdout, process.stderr] }
    )
    tauriDriver.on('error', (error) => {
      console.error('tauri-driver error:', error)
      process.exit(1)
    })
    tauriDriver.on('exit', (code) => {
      if (!exit) {
        console.error('tauri-driver exited with code:', code)
        process.exit(1)
      }
    })
  },

  afterSession: () => {
    closeTauriDriver()
  },

  onComplete: () => {
    if (serverProc) { serverProc.kill(); serverProc = null }
  },

  // Expose to tests
  before: function () {
    global.zellServerKey = serverKey
    global.zellServerUrl = 'http://127.0.0.1:3000'
    global.killServer = () => {
      if (serverProc) { serverProc.kill(); serverProc = null }
    }
    global.startServer = () => {
      if (serverProc && !serverProc.killed) return
      const serverDir = path.resolve(__dirname, '..', '..', 'server')
      serverProc = spawn(path.resolve(serverDir, 'zell-server'), [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ZELL_DATA_DIR: '/tmp/zell-e2e-server' },
      })
      spawnSync('sleep', ['2'])
    }
  },
}

function closeTauriDriver() {
  exit = true
  tauriDriver?.kill()
}

function onShutdown(fn) {
  const cleanup = () => {
    try { fn() } finally { process.exit() }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('SIGHUP', cleanup)
  process.on('SIGBREAK', cleanup)
}

onShutdown(() => {
  closeTauriDriver()
  if (serverProc) serverProc.kill()
})
