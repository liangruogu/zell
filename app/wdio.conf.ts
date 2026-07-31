import type { Options } from '@wdio/types'

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./tests/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [{ browserName: 'zell' }],
  logLevel: 'info',
  framework: 'mocha',
  mochaOpts: { timeout: 120000 },
  hostname: 'localhost',
  port: 4444,
  path: '/',
}
