#!/usr/bin/env node
/* Opruimronde voor ~/.axe/worktrees als los commando (24 nov).
   De autosync draait dit elke ronde vóór de build: zo ruimt een Mac zichzelf op
   ook als zijn build faalt op een volle schijf (Mac mini, 24 nov 01:36) -- de
   worker met het opruimen erin krijgt hij pas na een geslaagde build.
   Zelfde regels als de worker: open werk blijft, branches met commits blijven. */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { veegWorktrees, hoofdRepoVan, bewaarWerk } from './worktreeOpruim.mjs';

const git = (cwd, ...a) => new Promise((res, rej) =>
  execFile('git', a, { cwd, maxBuffer: 8 << 20 }, (e, o, s) => (e ? rej(new Error(s || e.message)) : res(o.trim()))));

const map = join(homedir(), '.axe', 'worktrees');
const uit = await veegWorktrees(git, map, p => hoofdRepoVan(p, f => readFile(f, 'utf8')));
// Open werk dat al een dag stil ligt: vastleggen op de eigen branch, zodat het niet
// in een map blijft hangen (de volgende ronde ruimt de map dan op).
let bewaard = 0;
for (const u of uit.filter(x => x.actie === 'laten' && x.branch?.startsWith('axe/') && x.leeftijdUur >= 24)) {
  try { if (await bewaarWerk(git, u.pad)) bewaard += 1; } catch { /* volgende ronde */ }
}
const tel = {};
for (const u of uit) tel[u.actie] = (tel[u.actie] || 0) + 1;
console.log(`worktrees: ${JSON.stringify(tel)}${bewaard ? `, ${bewaard} open werk bewaard op eigen branch` : ''}`);
