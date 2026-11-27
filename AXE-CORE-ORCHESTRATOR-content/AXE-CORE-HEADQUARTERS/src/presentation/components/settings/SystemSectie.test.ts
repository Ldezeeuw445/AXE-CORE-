import { describe, expect, it } from 'vitest';
import { dienstToon, sorteerDiensten } from '@/domain/settings/dienstRaster';
import type { ServiceState } from '@/application/system/systemService';

const s = (service: string, status: string): ServiceState => ({ id: service, service, display: service, status: status as ServiceState['status'], health: {}, version: null, last_seen: null, latency_ms: null, enabled: true });

describe('System section', () => {
  it('maps registry status to a tone', () => {
    expect(dienstToon('online')).toBe('ok');
    expect(dienstToon('degraded')).toBe('let-op');
    expect(dienstToon('offline')).toBe('fout');
    expect(dienstToon('unknown')).toBe('uit');
  });

  it('puts outages first, then the fixed order', () => {
    const uit = sorteerDiensten([s('xai', 'online'), s('github', 'online'), s('livekit', 'offline'), s('supabase', 'online')]);
    expect(uit.map((x) => x.service)).toEqual(['livekit', 'supabase', 'github', 'xai']);
  });
});
