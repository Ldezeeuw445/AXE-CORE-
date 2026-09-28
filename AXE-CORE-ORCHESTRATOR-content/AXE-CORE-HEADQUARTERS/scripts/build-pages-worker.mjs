/**
 * Bundelt scripts/pagesWorker.ts naar <out>/_worker.js en schrijft
 * <out>/_routes.json, zodat alleen /api de worker raakt. Waarom een worker en
 * niet functions/: zie de kop van pagesWorker.ts.
 *
 * Alleen `build:web` roept dit aan; de Tauri-build heeft geen proxy nodig.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist/public';

await build({
  entryPoints: ['scripts/pagesWorker.ts'],
  outfile: join(out, '_worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'warning',
});

writeFileSync(
  join(out, '_routes.json'),
  `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2)}\n`,
);

console.log(`build-pages-worker: ${join(out, '_worker.js')} + _routes.json (alleen /api/*)`);
