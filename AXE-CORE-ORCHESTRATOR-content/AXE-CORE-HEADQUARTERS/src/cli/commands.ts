/**
 * Commando-uitvoer. I/O gaat via AxeHttp + MemoryBackend, zodat tests
 * geen netwerk nodig hebben en een latere AXON-poort hier inschuift.
 */

import { readFileSync } from 'node:fs';
import { helpText } from './catalog';
import type { AxeHttp } from './client';
import { AxeHttpError } from './client';
import type { AxeConfig } from './config';
import { publicConfig } from './config';
import { envelope, type CliEnvelope } from './envelope';
import { decideGuard } from './guardrails';
import type { MemoryBackend } from './memoryPort';
import type { ParsedCommand } from './parse';
import { UsageError } from './parse';

export interface CommandDeps {
  http: AxeHttp;
  memory: MemoryBackend;
  config: AxeConfig;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readFile?: (path: string) => string;
}

const TERMINAL = new Set(['completed', 'done', 'failed', 'cancelled', 'rejected']);

function flagStr(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

function firstText(positionals: string[], flags: Record<string, string | boolean>, name: string): string {
  const fromFlag = flagStr(flags, name);
  if (fromFlag) return fromFlag;
  return positionals.join(' ').trim();
}

async function audit(deps: CommandDeps, parsed: ParsedCommand, resultStatus: string): Promise<void> {
  const body = {
    actor: parsed.actor ?? deps.config.actor,
    command: parsed.path,
    args: parsed.raw,
    status: resultStatus,
    at: new Date((deps.now ?? Date.now)()).toISOString(),
  };
  try {
    await deps.http.post('/cli/audit', body);
  } catch {
    try {
      await deps.memory.add({
        text: JSON.stringify(body),
        key: `cli/audit/${body.at}`,
        category: 'cli_audit',
      });
    } catch {
      /* audit mag een commando niet laten falen */
    }
  }
}

async function requestApproval(deps: CommandDeps, title: string, detail: string, parsed: ParsedCommand): Promise<CliEnvelope> {
  try {
    const created = await deps.http.post('/tasks', {
      title,
      goal: detail,
      requested_by: parsed.actor ?? deps.config.actor,
      source_app: 'os3',
      capability: 'approval',
      execution_mode: 'read',
      payload: { command: parsed.path, raw: parsed.raw },
    }) as { task?: { id: string } };
    const taskId = created.task?.id;
    if (!taskId) throw new Error('no task id');
    const approval = await deps.http.post(`/tasks/${taskId}/approvals`, {
      kind: 'os3',
      title,
      detail,
      requested_by: parsed.actor ?? deps.config.actor,
    }) as { approval?: { id: string; status?: string } };
    return envelope({
      command: parsed.path,
      status: 'pending_approval',
      error: 'pending approval',
      approval: {
        id: approval.approval?.id ?? taskId,
        status: approval.approval?.status ?? 'pending',
        title,
      },
      result: { task_id: taskId },
    });
  } catch (e) {
    return envelope({
      command: parsed.path,
      status: 'pending_approval',
      error: `pending approval (${e instanceof Error ? e.message : String(e)})`,
    });
  }
}

export async function execute(parsed: ParsedCommand, deps: CommandDeps): Promise<CliEnvelope> {
  if (parsed.help && parsed.path === 'help') {
    return envelope({ command: 'help', status: 'ok', result: { help: helpText(), commands: helpText() } });
  }

  const guard = decideGuard({ path: parsed.path, raw: parsed.raw, write: parsed.write });
  if (guard.kind === 'blocked') {
    const env = envelope({ command: parsed.path, status: 'blocked', error: guard.reason });
    await audit(deps, parsed, 'blocked');
    return env;
  }
  if (guard.kind === 'need_write') {
    return envelope({ command: parsed.path, status: 'usage', error: guard.reason });
  }
  if (guard.kind === 'need_approval') {
    const env = await requestApproval(deps, `OS3: ${parsed.path}`, guard.reason, parsed);
    await audit(deps, parsed, 'pending_approval');
    return env;
  }

  try {
    const result = await run(parsed, deps);
    await audit(deps, parsed, result.status);
    return result;
  } catch (e) {
    if (e instanceof UsageError) {
      return envelope({ command: parsed.path, status: 'usage', error: e.message });
    }
    if (e instanceof AxeHttpError) {
      const status = e.status === 404 ? 'not_found' : e.status === 403 ? 'blocked' : 'error';
      const env = envelope({ command: parsed.path, status, error: e.message });
      await audit(deps, parsed, status);
      return env;
    }
    const env = envelope({
      command: parsed.path,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    });
    await audit(deps, parsed, 'error');
    return env;
  }
}

async function run(parsed: ParsedCommand, deps: CommandDeps): Promise<CliEnvelope> {
  const { http, memory, config } = deps;
  const p = parsed.positionals;
  const f = parsed.flags;

  switch (parsed.path) {
    case 'help':
      return envelope({ command: 'help', status: 'ok', result: { help: helpText() } });

    case 'status': {
      const [health, agents, providers, cron, northsea, frameworks] = await Promise.allSettled([
        http.get('/health'),
        http.get('/status/vps-agents'),
        http.get('/proxy/ai/providers'),
        http.get('/cron/schedules'),
        http.get('/northsea/system-health'),
        http.get('/frameworks/status'),
      ]);
      const take = (s: PromiseSettledResult<unknown>) => (s.status === 'fulfilled' ? s.value : { error: String(s.reason) });
      return envelope({
        command: 'status',
        status: 'ok',
        result: {
          core: take(health),
          agents: take(agents),
          llm: take(providers),
          cron: take(cron),
          northsea: take(northsea),
          frameworks: take(frameworks),
          memory_backend: memory.name,
          nodes: { mac: config.nodeMac, vps: config.nodeVps },
          config: publicConfig(config),
        },
      });
    }

    case 'tasks list': {
      const status = flagStr(f, 'status');
      const limit = flagStr(f, 'limit') ?? '50';
      const q: Record<string, string> = { limit };
      if (status) q.status = status;
      const data = await http.get('/tasks', q);
      return envelope({ command: parsed.path, status: 'ok', result: data });
    }

    case 'tasks create': {
      const title = flagStr(f, 'title') ?? p[0];
      const goal = flagStr(f, 'goal') ?? p.slice(title === p[0] ? 1 : 0).join(' ');
      if (!title?.trim() || !goal?.trim()) throw new UsageError('tasks create needs --title and --goal');
      const data = await http.post('/tasks', {
        title: title.trim(),
        goal: goal.trim(),
        priority: flagStr(f, 'priority') ?? 'medium',
        requested_by: parsed.actor ?? config.actor,
        source_app: 'os3',
        capability: flagStr(f, 'agent') ?? 'agentic',
      });
      return envelope({ command: parsed.path, status: 'ok', result: data });
    }

    case 'tasks show': {
      const id = p[0] ?? flagStr(f, 'id');
      if (!id) throw new UsageError('tasks show needs an id');
      const data = await http.get(`/tasks/${id}`);
      return envelope({ command: parsed.path, status: 'ok', result: data });
    }

    case 'tasks update': {
      const id = p[0] ?? flagStr(f, 'id');
      if (!id) throw new UsageError('tasks update needs an id');
      const body: Record<string, string> = {};
      for (const k of ['title', 'goal', 'priority', 'description'] as const) {
        const v = flagStr(f, k);
        if (v) body[k] = v;
      }
      if (Object.keys(body).length === 0) throw new UsageError('tasks update needs a field to change');
      const data = await http.patch(`/tasks/${id}`, body);
      return envelope({ command: parsed.path, status: 'ok', result: data });
    }

    case 'task wait': {
      const id = p[0] ?? flagStr(f, 'id');
      if (!id) throw new UsageError('task wait needs an id');
      const timeout = (parsed.timeoutSec ?? Number(flagStr(f, 'timeout') ?? 90)) * 1000;
      const sleep = deps.sleep ?? ((ms) => new Promise((r) => { setTimeout(r, ms); }));
      const now = deps.now ?? Date.now;
      const start = now();
      let last: unknown = null;
      while (now() - start < timeout) {
        last = await http.get(`/tasks/${id}`);
        const status = (last as { task?: { status?: string } })?.task?.status
          ?? (last as { status?: string })?.status;
        if (status && TERMINAL.has(status)) {
          return envelope({ command: parsed.path, status: 'ok', result: last });
        }
        await sleep(2000);
      }
      return envelope({ command: parsed.path, status: 'error', error: 'timeout waiting for task', result: last });
    }

    case 'agents list': {
      const [bridges, live, cli] = await Promise.allSettled([
        http.get('/internal/agents/status'),
        http.get('/status/vps-agents'),
        http.get('/cli/agents'),
      ]);
      const take = (s: PromiseSettledResult<unknown>) => (s.status === 'fulfilled' ? s.value : null);
      return envelope({
        command: parsed.path,
        status: 'ok',
        result: { cli: take(cli), bridges: take(bridges), live: take(live) },
      });
    }

    case 'agent run': {
      const agent = p[0];
      const instruction = p.slice(1).join(' ').trim();
      if (!agent || !instruction) throw new UsageError('agent run needs <agent> and an instruction');
      try {
        const data = await http.post(`/cli/agents/${encodeURIComponent(agent)}/run`, {
          instruction,
          requested_by: parsed.actor ?? config.actor,
        }) as { task?: { id: string }; task_id?: string };
        const taskId = data.task?.id ?? data.task_id;
        return envelope({ command: parsed.path, status: 'ok', result: { ...data, task_id: taskId } });
      } catch (e) {
        if (!(e instanceof AxeHttpError) || e.status !== 404) throw e;
        const data = await http.post('/tasks', {
          title: `${agent}: ${instruction.slice(0, 80)}`,
          goal: instruction,
          requested_by: parsed.actor ?? config.actor,
          source_app: 'os3',
          capability: capabilityFor(agent),
          metadata: { agent, source: 'os3' },
          payload: { request: instruction, agent },
        }) as { task?: { id: string } };
        return envelope({ command: parsed.path, status: 'ok', result: { ...data, task_id: data.task?.id } });
      }
    }

    case 'memory search': {
      const q = firstText(p, f, 'q') || flagStr(f, 'query') || '';
      if (!q) throw new UsageError('memory search needs a query');
      const limit = Number(flagStr(f, 'limit') ?? 10);
      const hits = await memory.search(q, Number.isFinite(limit) ? limit : 10);
      return envelope({ command: parsed.path, status: 'ok', result: { backend: memory.name, hits } });
    }

    case 'memory add': {
      const filePath = flagStr(f, 'file');
      const lees = deps.readFile ?? ((pad: string) => readFileSync(pad, 'utf8'));
      const text = flagStr(f, 'text') ?? (filePath ? lees(filePath) : p.join(' '));
      if (!String(text || '').trim()) throw new UsageError('memory add needs --text or --file');
      const saved = await memory.add({
        text: String(text),
        key: flagStr(f, 'key'),
        category: flagStr(f, 'category') ?? 'cli',
      });
      return envelope({ command: parsed.path, status: 'ok', result: { backend: memory.name, ...saved } });
    }

    case 'northsea status': {
      const [health, overzicht] = await Promise.allSettled([
        http.get('/northsea/system-health'),
        http.get('/northsea/overzicht'),
      ]);
      return envelope({
        command: parsed.path,
        status: 'ok',
        result: {
          health: health.status === 'fulfilled' ? health.value : { error: String(health.reason) },
          overzicht: overzicht.status === 'fulfilled' ? overzicht.value : { error: String(overzicht.reason) },
        },
      });
    }

    case 'northsea deals':
      return envelope({ command: parsed.path, status: 'ok', result: await http.get('/northsea/tab/deals') });

    case 'northsea journal':
      return envelope({ command: parsed.path, status: 'ok', result: await http.get('/northsea/tab/communicatie') });

    case 'trading status':
      return envelope({ command: parsed.path, status: 'ok', result: await http.get('/trading/overview') });

    case 'cron list': {
      const app = flagStr(f, 'app') ?? 'axe_core';
      const [schedules, jobs] = await Promise.allSettled([
        http.get('/cron/schedules'),
        http.get('/cron/jobs', { app_name: app }),
      ]);
      return envelope({
        command: parsed.path,
        status: 'ok',
        result: {
          schedules: schedules.status === 'fulfilled' ? schedules.value : { error: String(schedules.reason) },
          jobs: jobs.status === 'fulfilled' ? jobs.value : { error: String(jobs.reason) },
        },
      });
    }

    case 'mcp list': {
      const [servers, hub] = await Promise.allSettled([
        http.get('/mcp/servers'),
        http.get('/mcp/hub'),
      ]);
      return envelope({
        command: parsed.path,
        status: 'ok',
        result: {
          servers: servers.status === 'fulfilled' ? servers.value : { error: String(servers.reason) },
          hub: hub.status === 'fulfilled' ? hub.value : { error: String(hub.reason) },
        },
      });
    }

    case 'notify': {
      const msg = firstText(p, f, 'message');
      if (!msg) throw new UsageError('notify needs a message');
      try {
        const data = await http.post('/cli/notify', { message: msg, actor: parsed.actor ?? config.actor });
        return envelope({ command: parsed.path, status: 'ok', result: data });
      } catch (e) {
        if (!(e instanceof AxeHttpError) || e.status !== 404) throw e;
        await http.post('/supabase/table/core_notifications', { data: { type: 'info', message: msg.slice(0, 1900) } });
        return envelope({ command: parsed.path, status: 'ok', result: { posted: true, via: 'core_notifications' } });
      }
    }

    case 'report': {
      const title = flagStr(f, 'title') ?? p[0];
      const file = flagStr(f, 'file');
      if (!title || !file) throw new UsageError('report needs a title and --file');
      const text = (deps.readFile ?? ((path: string) => readFileSync(path, 'utf8')))(file);
      try {
        const data = await http.post('/cli/report', {
          title,
          text,
          actor: parsed.actor ?? config.actor,
        });
        return envelope({ command: parsed.path, status: 'ok', result: data });
      } catch (e) {
        if (!(e instanceof AxeHttpError) || e.status !== 404) throw e;
        const saved = await memory.add({ text: `# ${title}\n\n${text}`, key: `report/${Date.now()}`, category: 'report' });
        return envelope({ command: parsed.path, status: 'ok', result: { ...saved, title } });
      }
    }

    case 'approvals list': {
      const data = await http.get('/approvals', {
        status: flagStr(f, 'status') ?? 'pending',
        limit: flagStr(f, 'limit') ?? '20',
      });
      return envelope({ command: parsed.path, status: 'ok', result: data });
    }

    case 'node list': {
      try {
        const data = await http.get('/cli/nodes');
        return envelope({ command: parsed.path, status: 'ok', result: data });
      } catch (e) {
        if (!(e instanceof AxeHttpError) || e.status !== 404) throw e;
        return envelope({
          command: parsed.path,
          status: 'ok',
          result: {
            via: 'config',
            note: 'Reads existing core_computer_workers. Install: scripts/install-computer-worker-launchd.sh',
            nodes: [
              { device_id: config.nodeMac, name: config.nodeMac, os: null, online: false, source: 'config' },
              { device_id: config.nodeVps, name: config.nodeVps, os: null, online: false, source: 'config' },
            ],
          },
        });
      }
    }

    default:
      throw new UsageError(`unknown command '${parsed.path}'`);
  }
}

export function capabilityFor(agent: string): string {
  switch (agent) {
    case 'developer': return 'code';
    case 'trading': return 'trading';
    case 'intel':
    case 'browser': return 'research';
    default: return 'agentic';
  }
}
