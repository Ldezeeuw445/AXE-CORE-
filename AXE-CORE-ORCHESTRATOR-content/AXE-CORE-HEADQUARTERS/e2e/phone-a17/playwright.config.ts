import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hq = join(here, '../..');

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 384, height: 832 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-A175F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
  webServer: {
    command: 'PORT=5199 npx vite --config vite.config.ts --host 127.0.0.1 --port 5199 --strictPort',
    cwd: hq,
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  outputDir: join(here, 'test-results'),
  snapshotPathTemplate: '{testDir}/shots/{arg}{ext}',
});
