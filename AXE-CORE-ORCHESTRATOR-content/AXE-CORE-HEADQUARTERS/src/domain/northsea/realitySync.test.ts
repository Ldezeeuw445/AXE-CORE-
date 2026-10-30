import { describe, it, expect } from 'vitest';
import { isActief } from './kaart';
import {
  REALITY_FACTS,
  realityVoor,
  metReality,
  laneTelling,
  realitySyncSql,
} from './realitySync';

describe('realitySync', () => {
  it('kent Harcros en Brixlegg als active facts', () => {
    expect(REALITY_FACTS).toHaveLength(2);
    expect(realityVoor({ leverancier: 'Harcros Chemi Ltd' })?.execution_state).toBe('docs_signed');
    expect(realityVoor({ leverancier: 'Montanwerke Brixlegg' })?.execution_state).toBe('indication_received');
  });

  it('overlay wint stage/next_action zonder de match te kwijtraken', () => {
    const d = metReality({
      id: '1',
      stage: 'identified',
      execution_state: 'matched',
      leverancier: 'Harcros',
      volgende: null,
    });
    expect(d.stage).toBe('introduced');
    expect(d.execution_state).toBe('docs_signed');
    expect(d.volgende).toMatch(/buyer intro/i);
    expect(d.reality?.evidence.some((e) => e.label === 'NCNDA' && e.status === 'signed')).toBe(true);
  });

  it('Active lane vangt reality-deals die nog identified/matched in DB staan', () => {
    const deals = [
      { id: 'h', stage: 'identified', execution_state: 'matched', leverancier: 'Harcros' },
      { id: 'b', stage: 'identified', execution_state: 'discovered', leverancier: 'Brixlegg AG' },
      { id: 'q1', stage: 'identified', execution_state: 'matched', leverancier: 'Other Co' },
      { id: 'q2', stage: 'identified', execution_state: '', leverancier: 'Quiet Ltd' },
    ];
    // Zonder reality zouden h/b quiet zijn (identified + matched/discovered).
    expect(isActief(deals[0])).toBe(false);
    const t = laneTelling(deals, isActief);
    expect(t.active).toBe(2);
    expect(t.quiet).toBe(2);
    expect(t.activeIds).toEqual(['h', 'b']);
  });

  it('SQL-patch noemt beide leveranciers en geen secrets', () => {
    const sql = realitySyncSql();
    expect(sql).toMatch(/Harcros/i);
    expect(sql).toMatch(/Brixlegg/i);
    expect(sql).toMatch(/docs_signed/);
    expect(sql).not.toMatch(/password|api[_-]?key|secret/i);
  });
});
