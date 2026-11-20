import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  use: { baseURL: 'http://localhost:5327', browserName: 'chromium' },
  webServer: {
    command: 'npm run build && node tests/web-server.mjs',
    url: 'http://localhost:5327/api/health',
    timeout: 30000,
  },
});
