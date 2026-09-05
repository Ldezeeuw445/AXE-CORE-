/**
 * Law 10: colour lives in the type, never in a fill.
 *
 * ## Why this is a test and not a note
 *
 * The design pack has nine laws written in a README. Measured on 2026-09-05,
 * the app had 173 backgrounds in an accent or semantic
 * hue across 68 files -- so the law that colour means state was being broken
 * by the very thing meant to express state. A law nobody can run decays.
 *
 * The rule Luka gave is sharper than the pack's and, unlike it, checkable:
 * words, letters and numbers carry the colour; boxes do not. A red word is
 * read; a red box is decoration that happens to be near the word.
 *
 * ## What is allowed
 *
 * White and black at low alpha stay -- those are surface, not colour. They are
 * how a panel lifts off the plate, and the pack's own law 2 depends on them.
 *
 * The one bright button per view (law 8) is exempt: it is an action, not a
 * state, and a primary action that does not fill is not a primary action. It
 * goes through PrimaryButton, so it is exempt by construction rather than by
 * being on a list.
 *
 * ## What to do instead of a coloured fill
 *
 *   status    colour the word: <span style={{ color: 'var(--m-broken)' }}>
 *   selection colour AND weight -- colour alone is too weak to carry it
 *   emphasis  weight, size or opacity; never another hue
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/presentation';

/** The accent and semantic hues, in every notation the codebase uses. */
const COLOURED = [
  /rgba?\(\s*16,\s*185/i,   // emerald  — success
  /rgba?\(\s*52,\s*211/i,   // emerald light
  /rgba?\(\s*245,\s*158/i,  // amber    — warning
  /rgba?\(\s*251,\s*191/i,  // amber light
  /rgba?\(\s*239,\s*68/i,   // red      — error
  /rgba?\(\s*248,\s*113/i,  // red light
  /rgba?\(\s*34,\s*211/i,   // cyan     — accent
  /rgba?\(\s*167,\s*139/i,  // violet
  /#(10b981|34d399|6ee7b7|f59e0b|fbbf24|ef4444|f87171|fca5a5|22d3ee|a78bfa)\b/i,
];

/**
 * A background declaration, in JSX style objects and in Tailwind classes.
 *
 * The window deliberately runs THROUGH commas. Stopping at the first one --
 * the obvious way to write this -- cut `rgba(239,68,68,0.1)` down to
 * `rgba(239` and matched nothing, so the first run of this file reported 8
 * violations where there are 99. A detector that under-reports is worse than
 * no detector: it says the work is done.
 */
const BACKGROUND = /(?:background(?:Color)?\s*:\s*|bg-\[)([^;}\n]{0,60})/gi;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

export function colouredFills(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(BACKGROUND)) {
    const value = m[1];
    if (COLOURED.some(re => re.test(value))) hits.push(value.trim().slice(0, 60));
  }
  return hits;
}

describe('law 10 — colour in the type, not in a fill', () => {
  it('finds a coloured background wherever it is written', () => {
    // Both notations, because the codebase uses both and a rule that only sees
    // one of them teaches people which one to hide in.
    expect(colouredFills("style={{ background: 'rgba(239,68,68,0.1)' }}")).toHaveLength(1);
    expect(colouredFills('className="bg-[rgba(34,211,238,.14)]"')).toHaveLength(1);
    expect(colouredFills("backgroundColor: '#F59E0B'")).toHaveLength(1);
  });

  it('leaves surface alone', () => {
    // White and black at low alpha are how a panel lifts off the plate. They
    // are not colour and law 2 depends on them.
    expect(colouredFills("background: 'rgba(255,255,255,0.03)'")).toHaveLength(0);
    expect(colouredFills("background: 'rgba(0,0,0,0.4)'")).toHaveLength(0);
    expect(colouredFills("background: 'var(--bg-panel)'")).toHaveLength(0);
  });

  it('does not fire on a coloured word', () => {
    // The whole point: this is the shape the violations should turn into.
    expect(colouredFills("style={{ color: '#F87171' }}")).toHaveLength(0);
    expect(colouredFills("className=\"text-axe-semantic-error\"")).toHaveLength(0);
  });
});

describe('the app itself', () => {
  const offenders = tsxFiles(ROOT)
    .map(f => ({ file: f, hits: colouredFills(readFileSync(f, 'utf8')) }))
    .filter(x => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  it('reports where the rule is still broken', () => {
    // Deliberately not `toBe(0)` yet. A test that fails on day one gets
    // skipped, and a skipped test is worse than none. This prints the ledger
    // and holds the line; the number comes down file by file and the
    // expectation tightens with it.
    const total = offenders.reduce((n, o) => n + o.hits.length, 0);
    if (total > 0) {
      const top = offenders.slice(0, 8).map(o => `  ${String(o.hits.length).padStart(3)}  ${o.file}`).join('\n');
      console.log(`\nLaw 10 — ${total} coloured fills left in ${offenders.length} files:\n${top}\n`);
    }
    expect(total).toBeLessThanOrEqual(CEILING);
  });
});

/**
 * The ratchet.
 *
 * Measured 2026-09-05 at 173 across 68 files; 149 after SettingsPage. It only ever goes down: lower it with every sweep,
 * and the test fails the moment someone adds one back. That is the whole
 * mechanism -- nobody has to remember the rule, because the rule remembers
 * itself.
 */
const CEILING = 132;
