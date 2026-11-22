import { beforeEach, describe, expect, it, vi } from 'vitest';

const memList = vi.fn();
const memUpsert = vi.fn();
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  memList: (...a: unknown[]) => memList(...a),
  memUpsert: (...a: unknown[]) => memUpsert(...a),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'luka-test' }));

import { _resetSessieGeheugen, haalSessieNotities, noteerAfgerondeSessies, sessieGeheugenContext } from './sessieGeheugen';

const MIN = 60_000;
const T0 = Date.parse('2026-11-22T09:00:00Z');
const draad = [
  { role: 'user' as const, text: 'Maak de notch mooier', timestamp: T0 },
  { role: 'axe' as const, text: 'Gedaan', timestamp: T0 + MIN },
];
const NU = T0 + 3 * 60 * MIN;

beforeEach(() => {
  _resetSessieGeheugen();
  memList.mockReset();
  memUpsert.mockReset().mockResolvedValue([]);
});

describe('sessieGeheugen', () => {
  it('schrijft een modelnotitie en toont hem daarna in de prompt', async () => {
    memList.mockResolvedValue([]);
    const vat = vi.fn().mockResolvedValue('Gevraagd: notch\nVeranderd: kaarten\nGestopt bij: halo');
    expect(await noteerAfgerondeSessies(draad, vat, NU)).toBe(1);
    const rij = memUpsert.mock.calls[0][0][0];
    expect(rij).toMatchObject({ user_id: 'luka-test', category: 'conversation_context', key: 'sessie:2026-11-22T09:00' });
    expect(rij.metadata.bron).toBe('model');
    expect(sessieGeheugenContext(NU)).toContain('Gestopt bij: halo');
  });

  it('valt terug op de simpele notitie als het model faalt', async () => {
    memList.mockResolvedValue([]);
    await noteerAfgerondeSessies(draad, vi.fn().mockRejectedValue(new Error('429')), NU);
    expect(memUpsert.mock.calls[0][0][0].metadata.bron).toBe('simpel');
  });

  it('schrijft niets als de sessie al genoteerd is', async () => {
    memList.mockResolvedValue([{ key: 'sessie:2026-11-22T09:00', value: 'Gevraagd: x\nGestopt bij: y', metadata: { start: T0 } }]);
    expect(await noteerAfgerondeSessies(draad, undefined, NU)).toBe(0);
    expect(memUpsert).not.toHaveBeenCalled();
  });

  it('houdt de cache als ophalen faalt', async () => {
    memList.mockResolvedValueOnce([{ key: 'sessie:2026-11-22T09:00', value: 'Gevraagd: x', metadata: null }]);
    await haalSessieNotities(true);
    memList.mockRejectedValueOnce(new Error('offline'));
    const n = await haalSessieNotities(true);
    expect(n).toHaveLength(1);
    expect(n[0].start).toBe(T0);
  });
});
