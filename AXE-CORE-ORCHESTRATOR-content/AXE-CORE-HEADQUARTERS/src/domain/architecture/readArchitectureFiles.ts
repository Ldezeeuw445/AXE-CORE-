/** Alleen voor tests en de generator-script: leest bronbestanden van schijf. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ArchitectureFileMap } from './generateArchitectureManifest';

const FILE_MATCH = /\.(sql|py|ts|tsx|md|json|yaml|yml|service|sh|cjs)$/;

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (FILE_MATCH.test(name)) acc.push(full);
  }
  return acc;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function headquartersRoot(): string {
  const fromUrl = resolve(new URL('../../..', import.meta.url).pathname);
  if (existsSync(join(fromUrl, 'package.json'))) return fromUrl;
  return process.cwd();
}

export function collectArchitectureFiles(hq = headquartersRoot()): ArchitectureFileMap {
  const repoRoot = resolve(hq, '../..');
  const files: ArchitectureFileMap = {};
  const roots = [
    join(hq, 'supabase/migrations'),
    join(hq, 'supabase/northsea/migrations'),
    join(hq, 'infra/migrations'),
    join(hq, 'scripts'),
    join(hq, 'docs/programma'),
    join(hq, 'backend/northsea_mcp/northsea_mcp/crews'),
    join(hq, 'backend/northsea_mcp/deploy'),
    join(hq, 'backend/axe_api'),
    join(hq, 'infra/axe-core-api'),
    join(hq, 'infra/axe-mac-tunnel'),
    join(hq, 'infra/scripts'),
    join(hq, 'infra/terminal'),
    join(hq, 'infra/vps-bootstrap.sh'),
    join(hq, 'src/domain/agents'),
    join(hq, 'src/domain/catalogs'),
    join(hq, 'src/domain/abonnementChat.ts'),
    join(hq, 'src/domain/providers.ts'),
    join(hq, 'src/domain/terminalHosts.ts'),
    join(hq, 'src/application/tradingIntel/researchCrewPrompt.ts'),
    join(hq, 'ECOSYSTEM.md'),
    join(repoRoot, 'supabase/migrations'),
    join(repoRoot, 'AGENTS.md'),
  ];
  for (const root of roots) {
    const paths = isDir(root) ? walk(root) : existsSync(root) ? [root] : [];
    for (const full of paths) {
      const rel = relative(hq, full).replace(/\\/g, '/');
      files[rel.startsWith('..') ? relative(repoRoot, full).replace(/\\/g, '/') : rel] = readFileSync(full, 'utf8');
    }
  }
  return files;
}
