import { describe, expect, it } from 'vitest';
import { hoortBij, leesRapport, oogstArtikel, oogstOpdracht, rapportenVan, type RapportRij } from './oogst';

const rapport = (titel: string, agent: string, uitkomst: 'klaar' | 'gestopt', tekst: string, opdracht = titel) =>
  `# ${titel}\n\n- Agent: ${agent}\n- Uitkomst: ${uitkomst}\n\n## Opdracht\n\n${opdracht}\n\n## ${uitkomst === 'klaar' ? 'Resultaat' : 'Waar het op stopte'}\n\n${tekst}`;

const RIJEN: RapportRij[] = [
  { key: 'projects/hide-trading-ui-job-1-0:73e1330855150678', created_at: '2026-11-25T21:52:00Z', content: rapport('Hide Trading UI', 'trading', 'klaar', 'Hidden in both apps.') },
  { key: 'projects/zet-markettide-job-2-0:38aad7e779effc7a', created_at: '2026-11-24T01:27:00Z', content: rapport('Zet marketTide op', 'tradingos', 'gestopt', 'Used all 40 steps.') },
  { key: 'projects/zet-markettide-job-2-0:2a29c7ced131ff74', created_at: '2026-11-24T01:28:00Z', content: rapport('Zet marketTide op', 'tradingos', 'gestopt', 'Used all 40 steps.') },
  { key: 'projects/approve-job-3-0:aa11bb22cc33dd44', created_at: '2026-11-18T10:00:00Z', content: rapport('Approve pending approvals', 'northseamgr', 'klaar', 'Done.') },
  { key: 'projects/kapot', content: 'geen kop' },
];

describe('6.6a harvest', () => {
  it('leest een rapport en herkent het project', () => {
    const r = leesRapport(RIJEN[0])!;
    expect(r).toMatchObject({ titel: 'Hide Trading UI', agent: 'trading', klaar: true, uitkomst: 'Hidden in both apps.' });
    expect(r.sleutel).toBe('projects/hide-trading-ui-job-1-0');
    expect(hoortBij('Trading OS', r)).toBe(true);
    expect(hoortBij('NorthSea', r)).toBe(false);
    expect(leesRapport(RIJEN[4])).toBeNull();
  });

  it('één rapport per job, oudste eerst', () => {
    expect(rapportenVan('Trading OS', RIJEN).map((r) => r.titel)).toEqual(['Zet marketTide op', 'Hide Trading UI']);
    expect(rapportenVan('NorthSea', RIJEN)).toHaveLength(1);
    expect(rapportenVan('marketTide', RIJEN)).toHaveLength(1);
  });

  it('maakt het artikel met klaar, gestopt en bronnen', () => {
    const a = oogstArtikel('Trading OS', RIJEN, Date.parse('2026-11-26T09:00:00Z'))!;
    expect(a.sleutel).toBe('wiki/trading-os');
    expect(a.aantal).toBe(2);
    expect(a.inhoud).toContain('# Trading OS');
    expect(a.inhoud).toContain('1 klaar, 1 gestopt');
    expect(a.inhoud).toMatch(/## Wat er gedaan is[\s\S]*Hide Trading UI[\s\S]*## Waar het op stopte[\s\S]*marketTide/);
    expect(a.inhoud).toContain('- projects/hide-trading-ui-job-1-0');
    expect(oogstArtikel('Bestaat niet', RIJEN)).toBeNull();
  });

  it('herkent de opdracht', () => {
    expect(oogstOpdracht('oogst Trading OS')).toEqual({ project: 'Trading OS' });
    expect(oogstOpdracht('maak een wiki-artikel van NorthSea')).toEqual({ project: 'NorthSea' });
    expect(oogstOpdracht('harvest the AXE CORE project')).toEqual({ project: 'AXE CORE' });
    expect(oogstOpdracht('wat is de oogst dit jaar in Nederland en waarom')).toBeNull();
  });
});
