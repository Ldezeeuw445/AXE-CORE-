/**
 * Parser voor `axe …`. Geen I/O. Fouten zijn usage, geen gok.
 */

import { COMMANDS } from './catalog';

export interface ParsedCommand {
  path: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
  write: boolean;
  json: boolean;
  help: boolean;
  raw: string;
  actor?: string;
  configPath?: string;
  timeoutSec?: number;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function takeFlag(argv: string[], i: number, name: string): { value: string; next: number } {
  const cur = argv[i];
  if (cur.startsWith(`${name}=`)) return { value: cur.slice(name.length + 1), next: i + 1 };
  const nxt = argv[i + 1];
  if (nxt === undefined || nxt.startsWith('-')) throw new UsageError(`${name} needs a value`);
  return { value: nxt, next: i + 2 };
}

const TWO_WORD = new Set([
  'tasks list', 'tasks create', 'tasks show', 'tasks update',
  'task wait', 'tasks wait',
  'agents list', 'agent run', 'agents run',
  'memory search', 'memory add',
  'northsea status', 'northsea deals', 'northsea journal',
  'trading status',
  'cron list',
  'mcp list',
  'approvals list',
]);

function resolvePath(words: string[]): { path: string; rest: string[] } {
  if (words.length === 0) return { path: 'help', rest: [] };
  const two = `${words[0]} ${words[1] ?? ''}`.trim();
  if (TWO_WORD.has(two)) {
    const path = two === 'tasks wait' ? 'task wait'
      : two === 'agents run' ? 'agent run'
        : two;
    return { path, rest: words.slice(2) };
  }
  if (words[0] === 'help' || words[0] === '--help' || words[0] === '-h') {
    return { path: 'help', rest: words.slice(1) };
  }
  const known = new Set(COMMANDS.map((c) => c.path.split(' ')[0]));
  if (!known.has(words[0]) && words[0] !== 'task' && words[0] !== 'agent') {
    throw new UsageError(`unknown command '${words[0]}'. See axe help`);
  }
  if (words[0] === 'notify') return { path: 'notify', rest: words.slice(1) };
  if (words[0] === 'report') return { path: 'report', rest: words.slice(1) };
  if (words[0] === 'status') return { path: 'status', rest: words.slice(1) };
  if (words[0] === 'help') return { path: 'help', rest: words.slice(1) };
  throw new UsageError(`incomplete command '${words.join(' ')}'. See axe help`);
}

export function parseArgv(argv: string[]): ParsedCommand {
  const flags: Record<string, string | boolean> = {};
  const loose: string[] = [];
  let write = false;
  let json = false;
  let help = false;
  let actor: string | undefined;
  let configPath: string | undefined;
  let timeoutSec: number | undefined;

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--') {
      loose.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--json') { json = true; i += 1; continue; }
    if (a === '--write' || a === '--confirm') { write = true; i += 1; continue; }
    if (a === '--help' || a === '-h') { help = true; i += 1; continue; }
    if (a === '--actor' || a.startsWith('--actor=')) {
      const t = takeFlag(argv, i, '--actor');
      actor = t.value;
      i = t.next;
      continue;
    }
    if (a === '--config' || a.startsWith('--config=')) {
      const t = takeFlag(argv, i, '--config');
      configPath = t.value;
      i = t.next;
      continue;
    }
    if (a === '--timeout' || a.startsWith('--timeout=')) {
      const t = takeFlag(argv, i, '--timeout');
      timeoutSec = Number(t.value);
      if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) throw new UsageError('--timeout must be a positive number');
      i = t.next;
      continue;
    }
    if (a.startsWith('--')) {
      const name = a.split('=')[0];
      if (a.includes('=')) {
        flags[name.slice(2)] = a.slice(name.length + 1);
        i += 1;
        continue;
      }
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('-')) {
        flags[name.slice(2)] = nxt;
        i += 2;
        continue;
      }
      flags[name.slice(2)] = true;
      i += 1;
      continue;
    }
    loose.push(a);
    i += 1;
  }

  const { path, rest } = resolvePath(loose);
  if (help && path === 'help') {
    /* stay help */
  }

  return {
    path,
    positionals: rest,
    flags,
    write,
    json,
    help,
    raw: argv.join(' '),
    actor,
    configPath,
    timeoutSec,
  };
}
