import { describe, it, expect } from 'vitest';
import { alleHosts, geldigeHostUrl, gekozenHost, VPS_HOST } from '@/domain/browserHosts';

const MINI = { id: 'mini', naam: 'Mac Mini', url: 'http://mac-mini.ts.net:8099' };

describe('een adres voor de browser-agent', () => {
  it('neemt http en https', () => {
    expect(geldigeHostUrl('http://mac-mini.ts.net:8099')).toBe('http://mac-mini.ts.net:8099');
    expect(geldigeHostUrl('https://imac.ts.net')).toBe('https://imac.ts.net');
  });

  it('weigert een adres met een pad', () => {
    // Er wordt /browser/agent/... achter geplakt; een basis met een pad geeft
    // stilletjes een verkeerde URL, en dat leest straks als een kapotte agent.
    expect(geldigeHostUrl('http://mac-mini.ts.net:8099/api')).toBeNull();
    expect(geldigeHostUrl('http://x.ts.net?a=1')).toBeNull();
  });

  it('weigert wat geen adres is', () => {
    expect(geldigeHostUrl('mac-mini')).toBeNull();
    expect(geldigeHostUrl('file:///etc/passwd')).toBeNull();
    expect(geldigeHostUrl('  ')).toBeNull();
  });
});

describe('welke host gebruikt wordt', () => {
  it('is de VPS als er niets gekozen is', () => {
    expect(gekozenHost([MINI], null)).toBe(VPS_HOST);
  });

  it('is de gekozen host', () => {
    expect(gekozenHost([MINI], 'mini')).toBe(MINI);
  });

  it('valt terug op de VPS als de keuze verwijderd is', () => {
    // Een lijst opschonen mag nooit de browser stilzetten.
    expect(gekozenHost([], 'mini')).toBe(VPS_HOST);
  });

  it('zet de VPS altijd vooraan en maar een keer', () => {
    const uit = alleHosts([MINI, { ...VPS_HOST, naam: 'nep' }]);
    expect(uit[0]).toBe(VPS_HOST);
    expect(uit.filter(h => h.id === 'vps')).toHaveLength(1);
  });
});
