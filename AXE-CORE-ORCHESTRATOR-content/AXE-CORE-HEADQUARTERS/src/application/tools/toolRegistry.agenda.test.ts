import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Afspraak } from '@/domain/agenda/afspraken';

// Opslag in het geheugen: de echte gaat naar localStorage en Supabase.
let opslag: Afspraak[] = [];
vi.mock('@/infrastructure/persistence/afsprakenService', () => ({
  laadAfspraken: async () => opslag,
  wijzigAfspraken: async <T,>(f: (h: Afspraak[]) => { lijst: Afspraak[]; uitkomst: T }) => {
    const r = f(opslag); opslag = r.lijst; return { uitkomst: r.uitkomst, gesynct: true };
  },
}));
const zoek = vi.fn();
vi.mock('@/application/places/findPlaces', () => ({ zoekPlaatsen: (...a: unknown[]) => zoek(...a) }));
vi.mock('@/infrastructure/gateways/locatieService', () => ({
  huidigeLocatie: async () => ({ lat: 52.37, lng: 4.9, bron: 'ip', naam: 'Amsterdam' }),
}));

import { AGENDA_TOOL_RUNTIMES } from './toolRegistry.agenda';
import { setProjectionSink } from '@/application/sphere/projectionPort';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { toolDefs } from '@/domain/tools/toolSchemas';
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';

const tool = (id: string) => AGENDA_TOOL_RUNTIMES.find(t => t.id === id)!;

let opHome: ProjectionPayload[] = [];
beforeEach(() => {
  opslag = []; zoek.mockReset(); opHome = [];
  setProjectionSink(p => { opHome.push(p); });
});

describe('find_places', () => {
  const resultaat = {
    soort: 'electronics', straalM: 1500,
    midden: { lat: 52.37, lng: 4.9, label: 'Amsterdam', bron: 'your internet connection (city level, not exact)' },
    plaatsen: [
      { id: 'n1', naam: 'Coolshop', lat: 52.371, lng: 4.901, soort: 'electronics', afstandM: 180, openingstijden: 'Mo-Sa 10-18' },
      { id: 'n2', naam: 'BCC', lat: 52.38, lng: 4.91, soort: 'electronics', afstandM: 1300 },
    ],
  };

  it('zet de kaart met de pins op Home en vertelt het model wat er staat', async () => {
    zoek.mockResolvedValue(resultaat);
    const uit = await tool('find_places').run(JSON.stringify({ what: 'electronics store', near: 'Dam' }));
    expect(zoek).toHaveBeenCalledWith({ wat: 'electronics store', nabij: 'Dam' });
    expect(uit).toContain('They are on Home now');
    expect(uit).toContain('Coolshop');
    expect(opHome).toHaveLength(1);
    expect(opHome[0].mode).toBe('map');
    expect((opHome[0].data?.places as unknown[]).length).toBe(2);
  });

  it('neemt een kale zoekterm aan (zoals het model hem stuurt als er één veld is)', async () => {
    zoek.mockResolvedValue(resultaat);
    await tool('find_places').run('restaurant');
    expect(zoek).toHaveBeenCalledWith({ wat: 'restaurant', nabij: undefined });
  });

  it('zegt eerlijk dat er niets is en zet dan niets op Home', async () => {
    zoek.mockResolvedValue({ ...resultaat, plaatsen: [] });
    const uit = await tool('find_places').run('{"what":"pharmacy"}');
    expect(uit).toMatch(/no electronics found/);
    expect(opHome).toHaveLength(0);
  });

  it('zegt dat het niet getoond is als Home niet luistert, in plaats van te doen alsof', async () => {
    setProjectionSink(null);
    zoek.mockResolvedValue(resultaat);
    const uit = await tool('find_places').run('{"what":"cafe"}');
    expect(uit).not.toContain('They are on Home now');
    expect(uit).toContain('Home could not show them');
  });

  it('geeft een fout van de zoeker door in plaats van plaatsen te verzinnen', async () => {
    zoek.mockResolvedValue({ fout: 'The map service did not answer.' });
    expect(await tool('find_places').run('{"what":"cafe"}')).toContain('did not answer');
  });
});

describe('de agenda', () => {
  it('zet een afspraak als gepland neer en waarschuwt bij een botsing', async () => {
    const een = await tool('agenda_add').run(JSON.stringify({ title: 'Dinner', date: '2030-05-03', time: '19:30', duration_min: 90 }));
    expect(een).toContain('AGENDA_ADD saved');
    expect(opslag[0]).toMatchObject({ titel: 'Dinner', status: 'gepland', tijd: '19:30' });
    const twee = await tool('agenda_add').run(JSON.stringify({ title: 'Call', date: '2030-05-03', time: '20:00' }));
    expect(twee).toContain('WARNING');
    expect(opslag).toHaveLength(2);
  });

  it('zet nooit zelf "bevestigd" tenzij het model dat expliciet zegt', async () => {
    await tool('agenda_add').run(JSON.stringify({ title: 'Tafel', date: '2030-05-03', time: '19:00', status: 'confirmed' }));
    expect(opslag[0].status).toBe('bevestigd');
  });

  it('weigert een afspraak die het niet kan lezen, en slaat niets op', async () => {
    const uit = await tool('agenda_add').run(JSON.stringify({ title: 'X', date: 'ooit', time: '19:00' }));
    expect(uit).toContain('failed');
    expect(opslag).toHaveLength(0);
  });

  it('annuleert zonder te wissen, en kiest niet als de titel twee kan zijn', async () => {
    await tool('agenda_add').run(JSON.stringify({ title: 'Tafel Rijsel', date: '2030-05-03', time: '19:00' }));
    await tool('agenda_add').run(JSON.stringify({ title: 'Tafel Zoldering', date: '2030-05-04', time: '19:00' }));
    const dubbel = await tool('agenda_update').run(JSON.stringify({ find: 'tafel', status: 'cancelled' }));
    expect(dubbel).toMatch(/More than one/);
    expect(opslag.every(a => a.status === 'gepland')).toBe(true);
    await tool('agenda_update').run(JSON.stringify({ find: 'rijsel', status: 'cancelled' }));
    expect(opslag).toHaveLength(2);
    expect(opslag.find(a => a.titel.includes('Rijsel'))?.status).toBe('geannuleerd');
  });

  it('lijst zegt de datum van vandaag, zodat het model "vrijdag" goed kan rekenen', async () => {
    const uit = await tool('agenda_list').run('{}');
    expect(uit).toMatch(/today is \d{4}-\d{2}-\d{2}/);
  });
});

describe('aansluiting', () => {
  it('alle vijf staan in de catalogus en hebben een schema met de goede velden', () => {
    const ids = ['find_places', 'my_location', 'agenda_add', 'agenda_list', 'agenda_update'];
    for (const id of ids) expect(TOOL_CATALOG.some(t => t.id === id)).toBe(true);
    const defs = Object.fromEntries(toolDefs().map(d => [d.name, d]));
    expect(Object.keys(defs.agenda_add.parameters.properties)).toEqual(expect.arrayContaining(['title', 'date', 'time', 'status']));
    expect(defs.agenda_add.parameters.required).toEqual(['title', 'date', 'time']);
    expect(defs.find_places.parameters.required).toEqual(['what']);
    expect(defs.agenda_list.parameters.required).toEqual([]);
  });
});
