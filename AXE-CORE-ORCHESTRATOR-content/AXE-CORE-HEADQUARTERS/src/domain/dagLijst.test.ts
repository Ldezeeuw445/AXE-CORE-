import { describe, it, expect } from 'vitest';
import { dagGroepen, tijdSpan, ritme, HERHALING_VANAF } from './dagLijst';
import type { RoosterItem } from './weekRooster';

const it_ = (id: string, titel: string, tijd: string, datum = '2026-10-09', extra: Partial<RoosterItem> = {}): RoosterItem =>
  ({ id, titel, datum, tijd, duurMin: 30, kleur: '#22D3EE', soort: 'cron', ...extra });

// Luka, 9 okt: de week-blokjes zijn niet te lezen; één dag, leesbaar, op een telefoon.
describe('de dag als lijst', () => {
  it('toont alleen die dag, op volgorde van de tijd', () => {
    const g = dagGroepen([it_('a', 'Lunch', '12:30'), it_('b', 'Standup', '09:00'), it_('c', 'Morgen', '08:00', '2026-10-10')], '2026-10-09');
    expect(g.map(x => x.titel)).toEqual(['Standup', 'Lunch']);
  });

  it('voegt een herhaling samen: dezelfde titel drie keer of vaker is één kaart met zijn tijden', () => {
    const rij = ['06:00', '06:15', '06:30', '06:45'].map((t, i) => it_(`c${i}`, 'axe-cron-collect', t));
    const g = dagGroepen([...rij, it_('x', 'Review', '07:00')], '2026-10-09');
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ titel: 'axe-cron-collect', aantal: 4, tijden: ['06:00', '06:15', '06:30', '06:45'] });
    expect(g[1].titel).toBe('Review');
  });

  it('twee keer is nog geen herhaling: elke afspraak houdt zijn eigen kaart', () => {
    expect(HERHALING_VANAF).toBe(3);
    const g = dagGroepen([it_('a', 'Sync', '09:00'), it_('b', 'Sync', '15:00')], '2026-10-09');
    expect(g).toHaveLength(2);
  });

  it('houdt verschillende soorten en kleuren uit elkaar, ook met dezelfde titel', () => {
    const rij = [
      it_('a', 'Check', '08:00'), it_('b', 'Check', '09:00'), it_('c', 'Check', '10:00', '2026-10-09', { kleur: '#F00' }),
    ];
    expect(dagGroepen(rij, '2026-10-09')).toHaveLength(3);
  });

  it('negeert wat geen leesbare tijd heeft, in plaats van het bovenaan te zetten', () => {
    expect(dagGroepen([it_('a', 'Raar', 'ergens')], '2026-10-09')).toEqual([]);
  });

  it('tijdSpan en ritme zeggen wat er staat', () => {
    expect(tijdSpan('09:00', 45)).toBe('09:00 – 09:45');
    expect(tijdSpan('09:00', 0)).toBe('09:00');
    expect(ritme(['06:00', '06:15', '06:30', '06:45'])).toBe('every 15 min');
    expect(ritme(['06:00', '07:00', '08:00'])).toBe('every hour');
    expect(ritme(['06:00', '06:10', '06:45'])).toBe('');
    expect(ritme(['06:00', '06:15'])).toBe('');
  });
});
