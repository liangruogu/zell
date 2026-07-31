import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './',
  timeout: 60000,
  retries: 0,
  projects: [
    {
      name: 'browser',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tauri',
      use: {},
    },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    port: 5173,
    reuseExistingServer: true,
  },
})
