import { describe, it, expect } from 'vitest';
import { mt5BridgeRegel } from './mt5BridgeStand';

describe('mt5BridgeRegel', () => {
  it('groen alleen als de bridge zelf gemeten werkt', () => {
    expect(mt5BridgeRegel({ reachable: true, stand: 'works', latency_ms: 40 })).toMatchObject({ status: 'online', label: 'Connected · works', latencyMs: 40 });
  });
  it('server aan zonder bridge-meting is oranje, niet groen', () => {
    expect(mt5BridgeRegel({ reachable: true, stand: 'connected', bridge: 'unmeasured', latency_ms: 293 }))
      .toMatchObject({ status: 'degraded', label: 'Connected · bridge not measured' });
  });
  it('bridge kapot en server weg', () => {
    expect(mt5BridgeRegel({ reachable: true, stand: 'bridge_down' }).status).toBe('degraded');
    expect(mt5BridgeRegel({ reachable: false, stand: 'offline' }).status).toBe('offline');
    expect(mt5BridgeRegel(undefined).status).toBe('offline');
  });
});
