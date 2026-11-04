import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hq = join(here, '../..');
/** Eigen poort kiezen (E2E_PORT) als een andere checkout 5176 al bezet houdt. */
const port = Number(process.env.E2E_PORT ?? 5176);

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  timeout: 90_000,
  retries: 0,
  fullyParallel: false,
  use: {
    viewport: { width: 1440, height: 900 },
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `PORT=${port} npx vite --config vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: hq,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  outputDir: join(here, 'test-results'),
  snapshotPathTemplate: '{testDir}/shots/{arg}{ext}',
});
