import { describe, expect, it } from 'vitest';
import { kluisZaadNotities } from './kluisZaadCatalogus';
import {
  architectuurKaarten,
  grafiekPadenGelijkAanKaarten,
  kluisGrafiekVan,
  kluisNotitiesVoorBord,
  werkAlsKluisNotities,
} from './kluisGrafiek';
import type { WerkItem } from '@/domain/werkBron';

describe('kluisgrafiek', () => {
  it('knopen zijn dezelfde notities als de architectuurkaarten', () => {
    const notes = [
      ...kluisZaadNotities(),
      {
        path: 'AXE/Agents/NorthSea Desk Manager/Tasks/t1/task.md',
        title: 'Check deals',
        content: 'task',
      },
    ];
    expect(grafiekPadenGelijkAanKaarten(notes)).toBe(true);
    const kaarten = architectuurKaarten(notes).map((k) => k.path).sort();
    const knopen = kluisGrafiekVan(notes).knopen.map((k) => k.path).sort();
    expect(knopen).toEqual(kaarten);
    expect(kluisGrafiekVan(notes).knopen.some((k) => k.soort === 'tab')).toBe(true);
    expect(kluisGrafiekVan(notes).knopen.some((k) => k.soort === 'agent')).toBe(true);
    expect(kluisGrafiekVan(notes).knopen.some((k) => k.soort === 'repo')).toBe(true);
  });

  it('taken op het bord komen uit de werkset, geen weesnotitie', () => {
    const werk: WerkItem[] = [{
      id: 't1',
      titel: 'Check deals',
      status: 'queued',
      eigenaar: 'NorthSea Desk Manager',
      agentId: 'northsea',
      oorsprong: 'luka',
      oorsprongTekst: 'NorthSea Desk Manager · spoken request',
      sleutel: 'check deals|northsea desk manager',
    }];
    const notes = kluisNotitiesVoorBord([
      ...kluisZaadNotities(),
      { path: 'AXE/Tasks/orphan/task.md', title: 'Ghost', content: 'nobody asked' },
    ], werk);
    expect(notes.some((n) => n.path.includes('orphan'))).toBe(false);
    expect(werkAlsKluisNotities(werk)[0].path).toMatch(/NorthSea Desk Manager\/Tasks\/t1/);
    expect(grafiekPadenGelijkAanKaarten(notes)).toBe(true);
  });
});
