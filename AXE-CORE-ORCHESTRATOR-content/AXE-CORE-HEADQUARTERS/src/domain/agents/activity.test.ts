import { describe, it, expect } from 'vitest';
import {
  agentForTask, agentForEpisode, loopAgentFor, isTradingMemory, memoryOwners,
  taskActivity, episodeActivity, runActivity, memoryActivity,
  buildTimeline, agentsWithData, schedulePlans, queuesByAgent, agentPulses, relativeTime,
  type ActivityItem,
} from './activity';

const NOW = Date.parse('2026-09-23T18:00:00Z');
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

describe('wie is wie', () => {
  it('vertaalt de oude planner-sleutels naar de roster, en laat trading weg', () => {
    expect(agentForTask({ id: '1', assignee: 'code-agent' })).toBe('developer');
    expect(agentForTask({ id: '2', assignee: 'maps-agent' })).toBe('northsea');
    expect(agentForTask({ id: '3', assignee: 'axe-core' })).toBe('axe');
    expect(agentForTask({ id: '4', assignee: 'axe-algo' })).toBeNull();
    expect(agentForTask({ id: '5', metadata: { agent: 'axe-algo' } })).toBeNull();
    expect(agentForTask({ id: '6', assignee: 'trading' })).toBeNull();
  });

  it('valt zonder assignee terug op de capability, anders op AXE', () => {
    expect(agentForTask({ id: '1', capability: 'claude_local' })).toBe('developer');
    expect(agentForTask({ id: '2', capability: 'computer_use' })).toBe('axe');
    // Een prototype-naam is geen assignee.
    expect(agentForTask({ id: '3', assignee: 'constructor' })).toBe('axe');
  });

  it('episodes: chat is AXE, trading-lanes en research tellen niet', () => {
    expect(agentForEpisode('chat')).toBe('axe');
    expect(agentForEpisode('code-editor')).toBe('developer');
    expect(agentForEpisode('wingman')).toBe('wingman');
    expect(agentForEpisode('trading')).toBeNull();
    expect(agentForEpisode('trading-desk-intel')).toBeNull();
    expect(agentForEpisode('research')).toBeNull();
    expect(loopAgentFor('axe')).toBe('chat');
    expect(loopAgentFor('developer')).toBe('code-editor');
    expect(loopAgentFor('trading')).toBeNull();
  });

  it('desk-rijen in axe_intel/global zijn trading, chat-rijen in global niet', () => {
    expect(isTradingMemory({ agent: 'axe_intel', source: 'axe-core-intel:22d old' })).toBe(true);
    expect(isTradingMemory({ agent: 'global', source: 'desk-companion' })).toBe(true);
    expect(isTradingMemory({ agent: 'axe_trader', source: 'chat' })).toBe(true);
    expect(isTradingMemory({ agent: 'global', source: 'chat:ollama' })).toBe(false);
  });

  it('geheugen-eigenaars: geen trading-namespace, crew valt onder Wingman', () => {
    const owners = memoryOwners();
    expect(owners.some(o => o.namespace === 'axe_trader')).toBe(false);
    expect(owners.find(o => o.id === 'axe')?.namespace).toBe('global');
    const crew = owners.filter(o => o.kind === 'crew');
    expect(crew.length).toBeGreaterThan(0);
    expect(crew.every(o => o.agent === 'wingman' && o.namespace.startsWith('crew_'))).toBe(true);
  });
});

describe('de tijdlijn', () => {
  it('een taak die nooit begon is een plan, geen activiteit', () => {
    expect(taskActivity({ id: 'p', status: 'pending', assignee: 'code-agent', created_at: iso(5) })).toBeNull();
  });

  it('afgerond, mislukt en bezig krijgen elk hun toon; de fout komt mee', () => {
    const done = taskActivity({ id: 'a', status: 'completed', assignee: 'axe-core', title: 'Refresh', completed_at: iso(3) });
    expect(done).toMatchObject({ agent: 'axe', tone: 'ok', text: 'Completed: Refresh', at: NOW - 3 * 60_000 });
    const failed = taskActivity({ id: 'b', status: 'failed', assignee: 'code-agent', title: 'Audit', updated_at: iso(4), error: { code: 'no_handler', message: 'No handler for planner' } });
    expect(failed).toMatchObject({ tone: 'fail', detail: 'No handler for planner' });
    const running = taskActivity({ id: 'c', status: 'running', title: 'Click', started_at: iso(1) });
    expect(running).toMatchObject({ tone: 'running', text: 'Working on: Click' });
    expect(taskActivity({ id: 'd', status: 'completed', assignee: 'axe-algo', completed_at: iso(1) })).toBeNull();
  });

  it('een episode is openen plus sluiten; Wingman-episodes zijn crew-runs', () => {
    const items = episodeActivity({ id: 'e', agent: 'wingman', subject: 'writer', verdict: 'good', opened_at: iso(10), closed_at: iso(8) });
    expect(items.map(i => i.text)).toEqual(['Started crew run: writer', 'Crew run finished (good): writer']);
    expect(items[1].tone).toBe('ok');
    expect(episodeActivity({ id: 't', agent: 'trading', opened_at: iso(1) })).toEqual([]);
  });

  it('runs: NorthSea is van de desk, de rest van de Cron Manager', () => {
    expect(runActivity({ id: 'r1', app: 'northsea', job_key: 'northsea:engine', job_name: 'Engine', status: 'ok', started_at: iso(1), duration_ms: 2400 }))
      .toMatchObject({ agent: 'northsea', tone: 'ok', text: 'Ran: Engine', detail: '2.4s' });
    expect(runActivity({ id: 'r2', app: 'axe_core', job_key: 'axe_core:mac-opruimen', status: 'fail', error: 'disk', started_at: iso(2) }))
      .toMatchObject({ agent: 'cron', tone: 'fail', detail: 'disk' });
  });

  it('geheugen: desk-schrijfsels vallen weg, de rest komt bij de eigenaar van de namespace', () => {
    expect(memoryActivity({ id: 'm1', agent: 'axe_companion', source: 'axe-core-companion:fresh', content: 'x', created_at: iso(1) })).toBeNull();
    expect(memoryActivity({ id: 'm2', agent: 'global', source: 'chat:ollama', content: 'Luka asked   about\nX', created_at: iso(1) }))
      .toMatchObject({ agent: 'axe', text: 'Remembered: Luka asked about X' });
  });

  it('voegt herhalingen samen op de plek van de nieuwste, na het filter, en nooit fouten met successen', () => {
    const run = (id: string, min: number, status = 'ok', app = 'northsea') =>
      runActivity({ id, app, job_key: `${app}:job`, job_name: 'Job', status, started_at: iso(min) }) as ActivityItem;
    const items = [run('1', 1), run('2', 16), run('x', 20, 'ok', 'axe_core'), run('3', 31), run('4', 46, 'fail'), run('5', 61), run('6', 70, 'fail')];
    const all = buildTimeline(items, 'all', 10);
    expect(all.map(i => [i.agent, i.tone, i.count])).toEqual([
      ['northsea', 'ok', 4], ['cron', 'ok', 1], ['northsea', 'fail', 1], ['northsea', 'fail', 1],
    ]);
    // De limiet telt regels, niet rijen: wat na de limiet komt telt nog mee in ×N.
    const two = buildTimeline(items, 'all', 1);
    expect(two.map(i => i.count)).toEqual([4]);
    expect(buildTimeline(items, 'cron', 10)).toHaveLength(1);
    expect(agentsWithData(items.map(i => i.agent))).toEqual(['northsea', 'cron']);
  });

  it('twee apparaten die om de beurt dezelfde check doen, worden twee regels', () => {
    const t = (id: string, min: number, device: string, status: string) =>
      taskActivity({ id, capability: 'computer_use', title: `computer.permissions · ${device}`, status, completed_at: iso(min), updated_at: iso(min) }) as ActivityItem;
    const items = [t('1', 1, 'mini', 'completed'), t('2', 1.2, 'imac', 'failed'), t('3', 1.4, 'mini', 'completed'), t('4', 1.6, 'imac', 'failed')];
    expect(buildTimeline(items, 'all', 10).map(i => [i.tone, i.count])).toEqual([['ok', 2], ['fail', 2]]);
  });
});

describe('de plannen', () => {
  it('een ingeschakeld schedule dat al uren te laat is, heet overdue en staat bovenaan', () => {
    const plans = schedulePlans([
      { id: 'a', name: 'Engine', app: 'northsea', enabled: true, next_run_at: iso(-10), cron_expr: '*/15 * * * *' },
      { id: 'b', name: 'Planner', app: 'axe_core', enabled: true, next_run_at: iso(60 * 24 * 6) },
      { id: 'c', name: 'Off', enabled: false, next_run_at: iso(-5) },
      { id: 'd', name: 'Just now', enabled: true, next_run_at: iso(2) },
    ], NOW);
    expect(plans.map(p => [p.name, p.state])).toEqual([
      ['Planner', 'overdue'], ['Just now', 'upcoming'], ['Engine', 'upcoming'], ['Off', 'disabled'],
    ]);
    expect(plans[0].agent).toBe('cron');
    expect(plans[2].agent).toBe('northsea');
  });

  it('open taken per agent, zonder trading, akkoord eerst en dan wat het langst wacht', () => {
    const queues = queuesByAgent([
      { id: '1', status: 'pending', assignee: 'code-agent', title: 'new', created_at: iso(10) },
      { id: '2', status: 'pending', assignee: 'code-agent', title: 'old', created_at: iso(100) },
      { id: '3', status: 'pending', assignee: 'code-agent', title: 'approve', created_at: iso(5), metadata: { goedkeuring: 'nodig' } },
      { id: '4', status: 'completed', assignee: 'code-agent', title: 'done' },
      { id: '5', status: 'pending', assignee: 'axe-algo', title: 'trade' },
      { id: '6', status: 'waiting_approval', title: 'agentic', created_at: iso(1) },
    ]);
    expect(queues.map(q => q.agent)).toEqual(['axe', 'developer']);
    const dev = queues[1];
    expect(dev.total).toBe(3);
    expect(dev.approvals).toBe(1);
    expect(dev.tasks.map(t => t.title)).toEqual(['approve', 'old', 'new']);
  });
});

describe('de War Room-kaart', () => {
  it('"working" alleen voor een recente lopende rij; een run die dagen loopt is "last"', () => {
    const items: ActivityItem[] = [
      runActivity({ id: 'old', app: 'axe_core', job_name: 'Planner', status: 'running', started_at: iso(60 * 24 * 6) })!,
      taskActivity({ id: 't', status: 'running', assignee: 'code-agent', title: 'Build', started_at: iso(20) })!,
      taskActivity({ id: 'u', status: 'completed', assignee: 'code-agent', title: 'Lint', completed_at: iso(5) })!,
    ];
    const pulses = agentPulses(items, NOW);
    expect(pulses.developer).toMatchObject({ working: true, text: 'Working on: Build' });
    expect(pulses.cron).toMatchObject({ working: false, text: 'Running: Planner' });
    expect(pulses.browser).toBeUndefined();
  });

  it('relatieve tijd naar beide kanten', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(relativeTime(NOW - 3 * 3600_000, NOW)).toBe('3h ago');
    expect(relativeTime(NOW - 6 * 86400_000, NOW)).toBe('6d ago');
    expect(relativeTime(NOW + 90 * 60_000, NOW)).toBe('in 2h');
  });
});
