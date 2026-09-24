/**
 * De axe-commandolaag: wat AXE's eigen node-agent (of OS3 als extra
 * executor) mag aanroepen. Eén bron voor help-tekst en de parser.
 * Geen geheimen.
 */

export type CommandRisk = 'read' | 'write' | 'blocked';

export interface CommandSpec {
  path: string;
  usage: string;
  summary: string;
  risk: CommandRisk;
  /** Extra vlaggen naast de globale. */
  flags: string[];
}

export const GLOBAL_FLAGS = [
  '--json',
  '--write',
  '--confirm',
  '--config <pad>',
  '--actor <naam>',
  '--timeout <sec>',
  '--help',
] as const;

export const COMMANDS: readonly CommandSpec[] = [
  { path: 'help', usage: 'axe help', summary: 'List every command and exit codes', risk: 'read', flags: [] },
  { path: 'status', usage: 'axe status', summary: 'Health of Core, LLM slots, agents, cron, NorthSea', risk: 'read', flags: [] },
  { path: 'tasks list', usage: 'axe tasks list [--status <s>] [--limit <n>]', summary: 'List durable tasks', risk: 'read', flags: ['--status', '--limit'] },
  { path: 'tasks create', usage: 'axe tasks create --title <t> --goal <g>', summary: 'Create a durable task', risk: 'write', flags: ['--title', '--goal', '--priority', '--agent'] },
  { path: 'tasks show', usage: 'axe tasks show <id>', summary: 'Show one durable task', risk: 'read', flags: [] },
  { path: 'tasks update', usage: 'axe tasks update <id> [--title] [--goal] [--priority]', summary: 'Update task fields (not status machine)', risk: 'write', flags: ['--title', '--goal', '--priority'] },
  { path: 'task wait', usage: 'axe task wait <id>', summary: 'Poll a task until it finishes', risk: 'read', flags: ['--timeout'] },
  { path: 'agents list', usage: 'axe agents list', summary: 'List AXE agents and VPS bridges', risk: 'read', flags: [] },
  { path: 'agent run', usage: 'axe agent run <agent> "<instruction>"', summary: 'Dispatch to the durable task kernel', risk: 'write', flags: [] },
  { path: 'memory search', usage: 'axe memory search "<q>"', summary: 'Search the learning-loop / RAG store', risk: 'read', flags: ['--limit'] },
  { path: 'memory add', usage: 'axe memory add --text "<t>" [--key] [--category]', summary: 'Add a memory (RAG is source of truth)', risk: 'write', flags: ['--text', '--file', '--key', '--category'] },
  { path: 'northsea status', usage: 'axe northsea status', summary: 'NorthSea health (read-only)', risk: 'read', flags: [] },
  { path: 'northsea deals', usage: 'axe northsea deals', summary: 'Open NorthSea deals (read-only)', risk: 'read', flags: [] },
  { path: 'northsea journal', usage: 'axe northsea journal', summary: 'NorthSea communications journal (read-only)', risk: 'read', flags: [] },
  { path: 'trading status', usage: 'axe trading status', summary: 'Trading desk overview (read-only)', risk: 'read', flags: [] },
  { path: 'cron list', usage: 'axe cron list', summary: 'Schedules and cron jobs', risk: 'read', flags: ['--app'] },
  { path: 'mcp list', usage: 'axe mcp list', summary: 'Configured MCP servers', risk: 'read', flags: [] },
  { path: 'notify', usage: 'axe notify "<msg>"', summary: 'Post into AXE chat + the notification bell', risk: 'write', flags: [] },
  { path: 'report', usage: 'axe report "<title>" --file <pad>', summary: 'Store a task report in memory and notify', risk: 'write', flags: ['--file'] },
  { path: 'approvals list', usage: 'axe approvals list', summary: 'Pending approvals visible in AXE', risk: 'read', flags: ['--status', '--limit'] },
  { path: 'node list', usage: 'axe node list', summary: 'Machines paired with AXE (name, OS, online)', risk: 'read', flags: [] },
  { path: 'node register', usage: 'axe node register --name <n> [--os <os>]', summary: 'Pair this machine; prints a one-time token', risk: 'write', flags: ['--name', '--os', '--capabilities'] },
  { path: 'node run', usage: 'axe node run [--once|--daemon]', summary: 'Outbound heartbeat + job poll (executor is phase 2)', risk: 'read', flags: ['--once', '--daemon', '--token', '--device'] },
];

export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  blocked: 3,
  pending: 4,
  notFound: 5,
  config: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const WRITE_PATHS = new Set(
  COMMANDS.filter((c) => c.risk === 'write').map((c) => c.path),
);

export function helpText(): string {
  const regels = [
    'axe — command layer for AXE Core (own node agent; OS3 optional).',
    '',
    'Global flags:',
    ...GLOBAL_FLAGS.map((f) => `  ${f}`),
    '',
    'Commands:',
    ...COMMANDS.map((c) => `  ${c.usage.padEnd(56)} ${c.summary}`),
    '',
    'Safety: read-only by default. Mutating commands need --write (or --confirm).',
    'Hard-blocked (no override): email/outbound send, NorthSea auto_send_* flags,',
    'merge to orchestrator, deleting data.',
    '',
    'Exit codes: 0 ok · 1 error · 2 usage · 3 blocked · 4 pending approval · 5 not found · 6 config',
  ];
  return regels.join('\n');
}
