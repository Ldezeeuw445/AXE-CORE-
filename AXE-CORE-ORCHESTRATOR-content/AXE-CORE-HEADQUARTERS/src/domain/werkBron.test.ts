import { describe, expect, it } from 'vitest';
import {
  cronAlsBron,
  heeftEchteEigenaar,
  taakAlsBron,
  voegWerkSamen,
  volgendeStapMagDoor,
  werkOorsprongVan,
} from './werkBron';

describe('één waarheid voor werk', () => {
  it('verbergt rijen zonder echte eigenaar', () => {
    const wees = taakAlsBron({
      id: 'x',
      title: 'Mysterious chore',
      status: 'queued',
      assignee: 'AXE Core',
      created_at: '2026-10-01T10:00:00Z',
      metadata: {},
    });
    expect(heeftEchteEigenaar(wees)).toBe(false);
    expect(voegWerkSamen([wees])).toEqual([]);
  });

  it('klapt dezelfde opdracht van planner en takenlijst tot één', () => {
    const planner = taakAlsBron({
      id: 'p1',
      title: 'Check NorthSea deals',
      status: 'pending',
      assignee: 'northsea',
      planner: true,
      metadata: { agent: 'northsea', planner: true },
    });
    const durable = taakAlsBron({
      id: 'd1',
      title: 'Check NorthSea deals',
      status: 'queued',
      assignee: 'northsea',
      requested_by: 'luka',
      metadata: { agent: 'northsea' },
    });
    const samen = voegWerkSamen([planner, durable]);
    expect(samen).toHaveLength(1);
    expect(samen[0].oorsprong).toBe('planner');
    expect(samen[0].oorsprongTekst).toMatch(/planner/);
    expect(samen[0].eigenaar).toMatch(/NorthSea/);
  });

  it('houdt cronjobs uit elkaar en noemt ze cron', () => {
    const a = cronAlsBron({ id: 'ochtend', name: 'Ochtendrapport', enabled: true, next_run_at: '2026-10-02T07:00:00Z' });
    const b = cronAlsBron({ id: 'avond', name: 'Avondrapport', enabled: true, next_run_at: '2026-10-02T19:00:00Z' });
    const samen = voegWerkSamen([a, b, a]);
    expect(samen).toHaveLength(2);
    expect(samen.every((w) => w.oorsprong === 'cron')).toBe(true);
    expect(werkOorsprongVan(a).tekst).toMatch(/Cron/);
  });

  it('stopt een volgende stap die zou mailen of auto_send aanzetten', () => {
    expect(volgendeStapMagDoor('send the offer to the buyer').door).toBe(false);
    expect(volgendeStapMagDoor('turn on auto_send_followups').door).toBe(false);
    expect(volgendeStapMagDoor('review the NorthSea desk queue').door).toBe(true);
  });
});
