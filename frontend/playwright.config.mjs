import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5199/agrisell/',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      ...(existsSync(chrome) ? { executablePath: chrome } : {}),
      args: ['--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199 --strictPort',
    env: { VITE_DELIVERY_ROUTING_URL: 'https://routing.test.invalid' },
    url: 'http://127.0.0.1:5199/agrisell/',
    reuseExistingServer: process.env.DELIVERY_REUSE_SERVER === '1',
  },
})
