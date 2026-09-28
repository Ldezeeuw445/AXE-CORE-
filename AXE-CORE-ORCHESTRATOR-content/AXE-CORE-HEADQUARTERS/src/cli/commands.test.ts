import { describe, expect, it } from 'vitest';
import type { AxeHttp } from './client';
import { AxeHttpError } from './client';
import { execute } from './commands';
import type { AxeConfig } from './config';
import type { MemoryBackend } from './memoryPort';
import { parseArgv } from './parse';

function cfg(): AxeConfig {
  return {
    apiUrl: 'https://api.axecompanion.com',
    apiKey: 'test-key',
    userId: 'user-1',
    actor: 'os3',
    memoryBackend: 'rag',
    nodeMac: 'mac-mini',
    nodeVps: 'vps',
    timeoutSec: 5,
  };
}

function mem(): MemoryBackend {
  const hits = [{ id: '1', source: 'rag' as const, content: 'copper deal' }];
  return {
    name: 'rag',
    async search() { return hits; },
    async add(input) { return { id: input.key ?? 'k1', key: input.key ?? 'k1' }; },
  };
}

function http(routes: Record<string, unknown | ((body?: unknown) => unknown)>): AxeHttp {
  const call = async (method: string, path: string, body?: unknown) => {
    const key = `${method} ${path}`;
    const hit = routes[key] ?? routes[path];
    if (hit === undefined) throw new AxeHttpError(`missing ${key}`, 404);
    return typeof hit === 'function' ? hit(body) : hit;
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
  };
}

async function run(argv: string[], h: AxeHttp) {
  return execute(parseArgv(argv), { http: h, memory: mem(), config: cfg() });
}

describe('axe commands', () => {
  it('help is JSON en noemt elk commando', async () => {
    const env = await run(['help', '--json'], http({}));
    expect(env.ok).toBe(true);
    expect(JSON.stringify(env.result)).toMatch(/axe status/);
    expect(env.exit).toBe(0);
  });

  it('notify zonder --write faalt, met --write schrijft', async () => {
    const h = http({
      'POST /cli/notify': { posted: true },
      'POST /cli/audit': {},
    });
    const blocked = await run(['notify', 'hello'], h);
    expect(blocked.status).toBe('usage');
    expect(blocked.error).toMatch(/--write/);

    const ok = await run(['notify', 'hello', '--write', '--json'], h);
    expect(ok.ok).toBe(true);
    expect((ok.result as { posted: boolean }).posted).toBe(true);
  });

  it('hard-blok blijft geblokkeerd met --write', async () => {
    const env = await run(['agent', 'run', 'northsea', 'verstuur het concept', '--write'], http({}));
    expect(env.status).toBe('blocked');
    expect(env.exit).toBe(3);
    expect(env.error).toMatch(/email|outbound/i);
  });

  it('agent run geeft een task id terug', async () => {
    const h = http({
      'POST /cli/agents/developer/run': { task: { id: 'task-9' } },
      'POST /cli/audit': {},
    });
    const env = await run(['agent', 'run', 'developer', 'fix the login bug', '--write', '--json'], h);
    expect(env.ok).toBe(true);
    expect((env.result as { task_id: string }).task_id).toBe('task-9');
  });

  it('memory search gebruikt de poort, niet een tweede store', async () => {
    const env = await run(['memory', 'search', 'copper', '--json'], http({ 'POST /cli/audit': {} }));
    expect(env.ok).toBe(true);
    const result = env.result as { backend: string; hits: Array<{ content: string }> };
    expect(result.backend).toBe('rag');
    expect(result.hits[0].content).toMatch(/copper/);
  });

  it('status vraagt de bestaande health-routes', async () => {
    const seen: string[] = [];
    const h: AxeHttp = {
      async get(path) { seen.push(path); return { ok: true, path }; },
      async post() { return {}; },
      async patch() { return {}; },
    };
    const env = await execute(parseArgv(['status', '--json']), { http: h, memory: mem(), config: cfg() });
    expect(env.ok).toBe(true);
    expect(seen).toContain('/health');
    expect(seen).toContain('/status/vps-agents');
    expect(seen).toContain('/northsea/system-health');
    expect(JSON.stringify(env.result)).not.toMatch(/test-key/);
  });

  it('approval-actie geeft pending approval', async () => {
    const h = http({
      'POST /tasks': { task: { id: 't-appr' } },
      'POST /tasks/t-appr/approvals': { approval: { id: 'a-1', status: 'pending' } },
      'POST /cli/audit': {},
    });
    const env = await run(['agent', 'run', 'developer', 'please git commit the workspace', '--write'], h);
    expect(env.status).toBe('pending_approval');
    expect(env.exit).toBe(4);
    expect(env.approval?.id).toBe('a-1');
  });

  it('node list leest bestaande computer-workers', async () => {
    const h = http({
      'GET /cli/nodes': { nodes: [{ device_id: 'mac-mini', online: true, source: 'core_computer_workers' }] },
      'POST /cli/audit': {},
    });
    const env = await run(['node', 'list', '--json'], h);
    expect(env.ok).toBe(true);
    expect(JSON.stringify(env.result)).toMatch(/mac-mini/);
    expect(JSON.stringify(env.result)).toMatch(/core_computer_workers/);
  });
});
