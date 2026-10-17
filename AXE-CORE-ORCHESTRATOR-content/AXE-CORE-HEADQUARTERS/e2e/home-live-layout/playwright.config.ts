import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    viewport: { width: 1440, height: 900 },
  },
  outputDir: join(here, 'test-results'),
  snapshotPathTemplate: '{testDir}/shots/{arg}{ext}',
});
