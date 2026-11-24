import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beslis, ruimWorktree, veegWorktrees, hoofdRepoVan } from './worktreeOpruim.mjs';

test('beslis: open werk blijft altijd, lege run gaat weg, commits houden de branch', () => {
  assert.equal(beslis({ open: ' M a.ts', commits: 0, leeftijdUur: 99, naRun: false }), 'laten');
  assert.equal(beslis({ open: '', commits: 0, leeftijdUur: 0, naRun: true }), 'weg_met_branch');
  assert.equal(beslis({ open: '', commits: 2, leeftijdUur: 0, naRun: true }), 'laten');
  assert.equal(beslis({ open: '', commits: 0, leeftijdUur: 0.5, naRun: false }), 'laten', 'misschien werkt er nog een agent in');
  assert.equal(beslis({ open: '', commits: 0, leeftijdUur: 3, naRun: false }), 'weg_met_branch');
  assert.equal(beslis({ open: '', commits: 2, leeftijdUur: 3, naRun: false }), 'laten');
  assert.equal(beslis({ open: '', commits: 2, leeftijdUur: 30, naRun: false }), 'weg_branch_blijft');
});

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const gitStreng = async (cwd, ...a) => g(cwd, ...a);

function repoMetWorktrees() {
  const d = mkdtempSync(join(tmpdir(), 'wt-'));
  const repo = join(d, 'repo'); const map = join(d, 'worktrees');
  execFileSync('git', ['init', '-q', '-b', 'orchestrator', repo]);
  g(repo, 'config', 'user.email', 't@t'); g(repo, 'config', 'user.name', 't');
  writeFileSync(join(repo, 'a.txt'), 'a'); g(repo, 'add', '.'); g(repo, 'commit', '-qm', 'begin');
  const maak = (naam) => { const p = join(map, naam); g(repo, 'worktree', 'add', '-q', '-b', `axe/${naam}`, p, 'HEAD'); return p; };
  return { repo, map, maak };
}

test('echte git: na een lege run gaan map en branch weg; met commits blijft alles', async () => {
  const { repo, maak } = repoMetWorktrees();
  const leeg = maak('leeg'); const basis = g(leeg, 'rev-parse', 'HEAD');
  const r1 = await ruimWorktree(gitStreng, repo, leeg, { basis, naRun: true });
  assert.equal(r1.actie, 'weg_met_branch');
  assert.ok(!existsSync(leeg));
  assert.equal(g(repo, 'branch', '--list', 'axe/leeg'), '');

  const werk = maak('werk');
  writeFileSync(join(werk, 'b.txt'), 'b'); g(werk, 'add', '.'); g(werk, 'commit', '-qm', 'werk');
  const r2 = await ruimWorktree(gitStreng, repo, werk, { basis, naRun: true });
  assert.equal(r2.actie, 'laten');
  assert.ok(existsSync(werk));
});

test('echte git: veegronde haalt oude schone weg, houdt branch met commits en open werk', async () => {
  const { repo, map, maak } = repoMetWorktrees();
  const oud = Date.now() / 1000 - 30 * 3600;
  const leeg = maak('leeg');
  const werk = maak('werk'); writeFileSync(join(werk, 'b.txt'), 'b'); g(werk, 'add', '.'); g(werk, 'commit', '-qm', 'werk');
  const open = maak('open'); writeFileSync(join(open, 'c.txt'), 'nog niet gecommit');
  const jong = maak('jong');
  for (const p of [leeg, werk, open]) utimesSync(p, oud, oud);

  assert.equal(await hoofdRepoVan(leeg, f => readFile(f, 'utf8')), g(repo, 'rev-parse', '--show-toplevel'));
  const uit = await veegWorktrees(gitStreng, map, p => hoofdRepoVan(p, f => readFile(f, 'utf8')));
  const actie = Object.fromEntries(uit.map(u => [u.branch, u.actie]));
  assert.deepEqual(actie, { 'axe/leeg': 'weg_met_branch', 'axe/werk': 'weg_branch_blijft', 'axe/open': 'laten', 'axe/jong': 'laten' });
  assert.ok(!existsSync(leeg) && !existsSync(werk) && existsSync(open) && existsSync(jong));
  assert.equal(g(repo, 'branch', '--list', 'axe/werk').replace('*', '').trim(), 'axe/werk', 'het werk blijft op de branch');
  assert.equal(readFileSync(join(open, 'c.txt'), 'utf8'), 'nog niet gecommit');
});
