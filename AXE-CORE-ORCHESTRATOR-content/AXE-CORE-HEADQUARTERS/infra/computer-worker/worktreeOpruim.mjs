/* Agent-worktrees opruimen (24 nov).

   Elke codex/claude/cursor-run krijgt een eigen worktree onder
   ~/.axe/worktrees (worker.mjs). Niemand ruimde die op: op 23 nov stonden er
   327 op de iMac, elk 121 MB -- 38 GB, schijf vol, builds en de Planner
   faalden ("No space left on device").

   Regels -- er gaat nooit werk verloren:
   - niet-gecommitte wijzigingen: blijft staan, altijd.
   - geen commits t.o.v. het begin, schoon: map weg en de lege branch weg.
   - wel commits, schoon: map weg, branch BLIJFT (het werk staat op de branch,
     klaar voor review; een worktree is daar niet voor nodig).
   Direct na een run alleen het eerste geval; de veegronde doet daarnaast
   schone worktrees ouder dan een dag. */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_LEEFTIJD_UUR = 24;
// Een agent-run duurt max 15 min; jonger dan dit kan er nog een agent in werken.
export const MIN_LEEFTIJD_UUR = 2;

/** Pure beslissing. feiten: { open: string, commits: number, leeftijdUur: number, naRun: boolean } */
export function beslis({ open, commits, leeftijdUur, naRun }) {
  if (String(open ?? '').trim()) return 'laten';
  if (!naRun && !(leeftijdUur >= MIN_LEEFTIJD_UUR)) return 'laten';
  if (commits === 0) return 'weg_met_branch';
  if (naRun) return 'laten';
  return leeftijdUur >= MAX_LEEFTIJD_UUR ? 'weg_branch_blijft' : 'laten';
}

async function feiten(git, pad, basis) {
  const veilig = async (...a) => { try { return (await git(pad, ...a)).trim(); } catch { return null; } };
  const open = await veilig('status', '--porcelain');
  if (open === null) return null; // geen geldige worktree meer
  const branch = await veilig('branch', '--show-current');
  const tel = basis
    ? await veilig('rev-list', '--count', `${basis}..HEAD`)
    // Zonder bekend begin: commits die nergens anders op een andere branch staan.
    : await veilig('rev-list', '--count', 'HEAD', '--not', '--exclude=' + branch, '--branches');
  return { open, branch, commits: Number(tel ?? NaN) };
}

/** Voert de beslissing uit. hoofdRepo = de checkout waar de worktree bij hoort. */
export async function ruimWorktree(git, hoofdRepo, pad, { basis = null, naRun = false, leeftijdUur = 0 } = {}) {
  const f = await feiten(git, pad, basis);
  if (!f || !Number.isFinite(f.commits)) return { pad, actie: 'laten', reden: 'onbekend' };
  const actie = beslis({ ...f, leeftijdUur, naRun });
  if (actie === 'laten') return { pad, actie, branch: f.branch };
  await git(hoofdRepo, 'worktree', 'remove', pad); // zonder --force: weigert als er toch iets open staat
  if (actie === 'weg_met_branch' && f.branch.startsWith('axe/')) {
    try { await git(hoofdRepo, 'branch', '-D', f.branch); } catch { /* branch al weg */ }
  }
  return { pad, actie, branch: f.branch };
}

/** Open werk van een agent vastleggen op zijn EIGEN axe/-branch. '' als er niets
 *  te bewaren is of de branch niet van een agent-run is (nooit orchestrator). */
export async function bewaarWerk(git, root) {
  const branch = await git(root, 'branch', '--show-current');
  if (!branch.startsWith('axe/')) return '';
  if (!(await git(root, 'status', '--porcelain'))) return '';
  await git(root, 'add', '-A');
  await git(root, 'commit', '--no-verify', '-m',
    'AXE: werk van de agent bewaard (agent committe niet zelf; niet getest)');
  return (await git(root, 'rev-parse', '--short', 'HEAD')) + ' (door de worker vastgelegd, niet getest)';
}

/** Hoofdcheckout van een worktree, uit zijn .git-bestand ("gitdir: <repo>/.git/worktrees/<naam>"). */
export async function hoofdRepoVan(pad, lees) {
  try {
    const m = /^gitdir:\s*(.+?)\/\.git\/worktrees\/[^/]+\s*$/m.exec(await lees(join(pad, '.git')));
    return m ? m[1] : null;
  } catch { return null; }
}

/** Veegronde over ~/.axe/worktrees. repoVoor(pad) geeft de hoofdcheckout of null. */
export async function veegWorktrees(git, map, repoVoor, nu = Date.now()) {
  let namen = [];
  try { namen = await readdir(map); } catch { return []; }
  const uit = [];
  const hoofden = new Set();
  for (const naam of namen) {
    const pad = join(map, naam);
    const hoofd = await repoVoor(pad);
    if (!hoofd) continue;
    hoofden.add(hoofd);
    let leeftijdUur = 0;
    try { leeftijdUur = (nu - (await stat(pad)).mtimeMs) / 3_600_000; } catch { continue; }
    try { uit.push(await ruimWorktree(git, hoofd, pad, { leeftijdUur })); }
    catch (e) { uit.push({ pad, actie: 'fout', reden: String(e?.message ?? e).slice(0, 200) }); }
  }
  for (const h of hoofden) { try { await git(h, 'worktree', 'prune'); } catch { /* best effort */ } }
  return uit;
}
