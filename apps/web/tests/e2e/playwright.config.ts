import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Local credentials stay in the ignored .env. CI can supply them through its environment.
const localEnv = resolve(process.cwd(), '../../.env')
if (existsSync(localEnv)) {
  for (const line of readFileSync(localEnv, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/tmp/waypoint-phase2-playwright',
  use: {
    baseURL: process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? '5173'}`,
    viewport: { width: 1280, height: 832 },
    trace: 'off', // Authentication traces could include credentials.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
  },
})
