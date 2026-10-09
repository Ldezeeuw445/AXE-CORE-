import { describe, it, expect, vi, beforeEach } from 'vitest';

// Een minimale localStorage: de tests draaien zonder DOM.
const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, String(v)); },
  removeItem: (k: string) => { opslag.delete(k); },
  clear: () => opslag.clear(),
});
vi.stubGlobal('DOMParser', class {
  // De zeef (saneerNotitieHtml) heeft hier niets te doen: de tests gebruiken alleen toegestane tags.
  parseFromString(html: string) { return { body: { innerHTML: html, children: [] as unknown[] } }; }
});

// Een nep-Supabase die onthoudt wat er heen ging, en die aan en uit kan.
const db: { rijen: Array<Record<string, unknown>>; aan: boolean; log: string[] } = { rijen: [], aan: true, log: [] };
let teller = 0;

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({
  getSupabase: () => (db.aan ? {
    from: () => ({
      insert: (r: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const id = `echt-${++teller}`;
            db.rijen.push({ id, created_at: 't', updated_at: 't', ...r });
            db.log.push(`insert:${id}`);
            return { data: { id }, error: null };
          },
        }),
      }),
      update: (r: Record<string, unknown>) => ({
        eq: async (_k: string, id: string) => {
          const rij = db.rijen.find(x => x.id === id);
          if (!rij) return { error: { message: 'bestaat niet' } };
          Object.assign(rij, { content: r.content, title: r.title });
          db.log.push(`update:${id}`);
          return { error: null };
        },
      }),
      delete: () => ({ eq: async (_k: string, id: string) => { db.rijen = db.rijen.filter(x => x.id !== id); db.log.push(`delete:${id}`); return { error: null }; } }),
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: db.rijen, error: null }) }) }) }),
    }),
  } : null),
}));

import {
  aantalWachtend, bewaarNotitie, echteId, laadNotities, maakNotitie, synchroniseer, verwijderNotitie,
} from './notitiesService';

beforeEach(() => {
  localStorage.clear();
  db.rijen = []; db.aan = true; db.log = []; teller = 0;
});

// Luka, 9 okt: "dat het echt allemaal goed opgeslagen wordt". Een notitie die je net typte mag niet
// verdwijnen doordat Supabase even niet antwoordde.
describe('notities bewaren: eerst lokaal, dan de cloud', () => {
  it('online: een nieuwe notitie komt in de cloud en de wachtrij is leeg', async () => {
    const n = await maakNotitie('<div>Eerste</div>');
    await synchroniseer();
    expect(db.rijen).toHaveLength(1);
    expect(db.rijen[0]).toMatchObject({ category: 'Quick Notes', content: '<div>Eerste</div>' });
    expect(aantalWachtend()).toBe(0);
    // De editor die nog de lokale id vasthoudt, vindt de echte.
    expect(echteId(n.id)).toBe('echt-1');
  });

  it('offline: de tekst blijft staan, de wachtrij houdt hem vast, en bij verbinding gaat hij alsnog', async () => {
    db.aan = false;
    const n = await maakNotitie('<div>Zonder verbinding</div>');
    expect(await bewaarNotitie(n.id, '<div>Zonder verbinding getypt</div>')).toBe('wacht');
    expect(aantalWachtend()).toBe(1);
    // Zichtbaar in de lijst, ook zonder cloud.
    const lijst = await laadNotities();
    expect(lijst.online).toBe(false);
    expect(lijst.notities.map(x => x.titel)).toEqual(['Zonder verbinding getypt']);

    db.aan = true;
    await synchroniseer();
    expect(aantalWachtend()).toBe(0);
    expect(db.rijen).toHaveLength(1);
    expect(db.rijen[0].content).toBe('<div>Zonder verbinding getypt</div>');
  });

  it('een bewerking van een bestaande notitie wordt een update, geen tweede rij', async () => {
    db.rijen = [{ id: 'abc', title: 'Oud', content: '<div>Oud</div>', created_at: 't', updated_at: 't' }];
    expect(await bewaarNotitie('abc', '<div>Nieuw</div>')).toBe('opgeslagen');
    expect(db.rijen).toHaveLength(1);
    expect(db.rijen[0]).toMatchObject({ content: '<div>Nieuw</div>', title: 'Nieuw' });
  });

  it('typen terwijl de notitie nog een lokale id heeft belandt bij de echte rij, niet in een tweede', async () => {
    db.aan = false;
    const n = await maakNotitie('<div>Begin</div>');
    db.aan = true;
    await synchroniseer();
    await bewaarNotitie(n.id, '<div>Begin en verder</div>');
    expect(db.rijen).toHaveLength(1);
    expect(db.rijen[0].content).toBe('<div>Begin en verder</div>');
  });

  it('verwijderen haalt hem uit de cloud; een nooit-gesynchroniseerde lokale notitie verdwijnt zonder cloud', async () => {
    db.rijen = [{ id: 'abc', title: 'x', content: '<div>x</div>', created_at: 't', updated_at: 't' }];
    await verwijderNotitie('abc');
    expect(db.rijen).toHaveLength(0);

    db.aan = false;
    const n = await maakNotitie('<div>Weg</div>');
    await verwijderNotitie(n.id);
    db.aan = true;
    await synchroniseer();
    expect(db.rijen).toHaveLength(0);
    expect(aantalWachtend()).toBe(0);
  });

  it('wat nog wacht staat in de lijst, ook als de cloud een oudere tekst teruggeeft', async () => {
    db.rijen = [{ id: 'abc', title: 'Oud', content: '<div>Oud</div>', created_at: '2026-10-09T08:00:00.000Z', updated_at: '2026-10-09T08:00:00.000Z' }];
    db.aan = false;
    await bewaarNotitie('abc', '<div>Lokaal nieuwer</div>');
    db.aan = true;
    // Een verzoek dat net faalde: zet hem terug in de wachtrij door de cloud eerst stuk te maken.
    const lijst = await laadNotities();
    expect(lijst.notities[0].inhoud).toBe('<div>Lokaal nieuwer</div>');
  });
});
