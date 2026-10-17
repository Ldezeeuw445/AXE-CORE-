import { describe, expect, it } from 'vitest';
import { emptyArchitectureManifest, heartbeatLiveStatus, mergeArchitectureLive } from './architectureGraph';

describe('mergeArchitectureLive', () => {
  it('overlays registered apps, workers and heartbeats without inventing owners', () => {
    const merged = mergeArchitectureLive(emptyArchitectureManifest(), {
      registered_apps: [{
        id: 'app-1',
        name: 'AXE Core HQ',
        product_key: 'axe_core',
        enabled: true,
        supabase_ref: 'pqnngpcgbdwxavbatbia',
        owner_agent: 'developer',
        cron_job_keys: ['axe_core:planner'],
      }],
      core_agents: [{ name: 'developer', display_name: 'AXE Developer', status: 'active', product_key: 'axe_core' }],
      core_computer_workers: [{
        device_id: 'imac-1',
        host: 'iMac',
        heartbeat_at: new Date().toISOString(),
      }],
    }, Date.now());

    expect(merged.nodes.some(n => n.id === 'app:axe_core')).toBe(true);
    expect(merged.nodes.some(n => n.id === 'supabase:pqnngpcgbdwxavbatbia')).toBe(true);
    expect(merged.nodes.find(n => n.id === 'worker:imac-1')?.details.liveStatus).toBe('online');
    expect(merged.edges.some(e => e.source === 'app:axe_core' && e.target === 'agent:developer')).toBe(true);
  });

  it('does not link a cron to an agent that is not in the graph', () => {
    const merged = mergeArchitectureLive(emptyArchitectureManifest(), {
      core_schedules: [{
        id: 'sched-1',
        name: 'ghost',
        metadata: { job_key: 'ghost' },
        action_payload: { agent: 'nobody' },
        enabled: true,
      }],
    });
    expect(merged.edges.some(e => e.target === 'agent:nobody')).toBe(false);
  });
});

describe('heartbeatLiveStatus', () => {
  it('treats a beat from this minute as online and an old one as offline', () => {
    const now = Date.parse('2026-10-17T08:00:00Z');
    expect(heartbeatLiveStatus('2026-10-17T07:59:00Z', now)).toBe('online');
    expect(heartbeatLiveStatus('2026-10-16T20:00:00Z', now)).toBe('stale');
    expect(heartbeatLiveStatus('2026-09-01T08:00:00Z', now)).toBe('offline');
    expect(heartbeatLiveStatus('', now)).toBe('unknown');
  });
});
