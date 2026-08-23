/**
 * The layering, enforced.
 *
 * AXE has had four layers for a long time and nothing that checked them, so
 * they eroded quietly: `domain` — which is supposed to depend on nothing —
 * reaches into infrastructure and presentation, and `application` reaches into
 * the UI. Eleven files, none of it deliberate, none of it noticed.
 *
 * A convention nobody can break by accident is the only kind that survives.
 * This is that check.
 *
 * ## How to use it when it fails
 *
 * It fails because you added an import that crosses a layer. The fix is
 * almost never to add your file to KNOWN below — it is to move the thing you
 * needed. A domain file that wants a gateway wants a parameter instead; an
 * application file that wants a React store wants the caller to pass the value
 * in.
 *
 * KNOWN is the debt that existed when this test was written. It may shrink.
 * It may not grow: that is the whole point.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('.', import.meta.url).pathname;

/** Who may import whom. Anything not listed is forbidden. */
const ALLOWED: Record<string, string[]> = {
  // The rules of the business. Depends on nothing — that is what makes it
  // testable without a browser, a database or a network.
  domain: ['domain', 'shared'],
  // Orchestrates domain rules using ports. Knows nothing about React.
  application: ['application', 'domain', 'shared', 'infrastructure'],
  // Talks to the outside world. Must not reach back up into the app or UI.
  infrastructure: ['infrastructure', 'domain', 'shared'],
  // May use everything. It is the edge.
  presentation: ['presentation', 'application', 'infrastructure', 'domain', 'shared'],
};

/**
 * The debt that existed on 2026-08-23. Shrink it; never add to it.
 *
 * Each of these is a real crossing, not a false positive — they are listed so
 * the test can guard everything else today rather than waiting for a cleanup
 * that would never come first.
 */
const KNOWN = new Set([
  'domain/taskRuntime.test.ts',
  'domain/replyLanguage.ts',
  'domain/customProviders.ts',
  'domain/catalogs/defaultAgents.ts',
  'domain/catalogs/mindsetLines.ts',
  'application/sphere/presentOnSphere.ts',
  'application/tradingIntel/backtestEngine.ts',
  // The worst one, and the one worth fixing first: 2 263 lines of
  // infrastructure importing a React store. A gateway that reads UI state
  // cannot be used from a worker, a test, or the VPS — it is only a gateway
  // by its folder. The fix is to pass what it needs in, not to look it up.
  'infrastructure/persistence/thinkThanksService.ts',
]);

function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const IMPORT_RE = /from\s+['"]@\/([a-z]+)\//g;

describe('layer boundaries', () => {
  const files = walk(SRC).filter(f => f.includes('/'));

  it('finds files to check, so a broken walk cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('no layer imports one it is not allowed to', () => {
    const broken: string[] = [];

    for (const rel of files) {
      const layer = rel.split('/')[0];
      const allowed = ALLOWED[layer];
      if (!allowed) continue;

      const src = readFileSync(join(SRC, rel), 'utf8');
      for (const m of src.matchAll(IMPORT_RE)) {
        const target = m[1];
        if (allowed.includes(target)) continue;
        if (KNOWN.has(rel)) continue;
        broken.push(`${rel} imports @/${target}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('the known-debt list only contains files that still break a rule', () => {
    // A stale entry is worse than none: it silently exempts a file that was
    // cleaned up, so the next crossing added to it goes unnoticed.
    const stale: string[] = [];

    for (const rel of KNOWN) {
      let crosses = false;
      try {
        const src = readFileSync(join(SRC, rel), 'utf8');
        const allowed = ALLOWED[rel.split('/')[0]] ?? [];
        for (const m of src.matchAll(IMPORT_RE)) {
          if (!allowed.includes(m[1])) { crosses = true; break; }
        }
      } catch {
        stale.push(`${rel} (file is gone)`);
        continue;
      }
      if (!crosses) stale.push(`${rel} (clean now — remove it from KNOWN)`);
    }

    expect(stale).toEqual([]);
  });
});
