import { describe, it, expect } from 'vitest';
import { monitoringIsFresh, monitoringSnapshot } from './serviceMonitoring';
import { notificationTarget } from './notification';
import { pushBerichtVan } from './pushBericht';

describe('service monitoring', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const snapshot = (at: string) => ({ checked_at: at, pending_notifications: 0, services: [] });
  it('never treats missing or old readings as healthy', () => {
    expect(monitoringIsFresh(null, now)).toBe(false);
    expect(monitoringIsFresh(snapshot('2026-10-14T11:55:00Z'), now)).toBe(false);
    expect(monitoringIsFresh(snapshot('invalid'), now)).toBe(false);
    expect(monitoringIsFresh(snapshot('2026-10-14T12:10:00Z'), now)).toBe(false);
    expect(monitoringIsFresh(snapshot('2026-10-14T11:59:00Z'), now)).toBe(true);
  });
  it('rejects malformed service data rather than displaying a fake green', () => {
    const out = monitoringSnapshot({ checked_at: '2026-10-14T12:00:00Z', services: [
      { component: 'ollama', label: 'Ollama', status: 'online', confirmed: 'online', checked_at: '2026-10-14T12:00:00Z' },
      { component: 'docker', label: 'Docker', status: 'OK' },
    ] });
    expect(out?.services).toHaveLength(1);
    expect(monitoringSnapshot({ services: [] })).toBeNull();
  });
  it('routes every monitoring alert to the same status page on desktop and Samsung', () => {
    for (const title of ['AXE service outage — CrewAI', 'AXE service recovered — GitHub', 'AXE dependency — Ollama']) {
      const message = `${title}\nImpact: agent execution. First step: check the service.`;
      expect(notificationTarget(message)?.route).toBe('/status');
      expect(pushBerichtVan({ id: '1', message })?.url).toBe('/status');
    }
  });
});
