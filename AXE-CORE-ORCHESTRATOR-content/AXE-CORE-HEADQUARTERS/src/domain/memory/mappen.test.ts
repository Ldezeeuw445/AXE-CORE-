/**
 * De vier vaste mappen.
 *
 * Twee dingen die hier echt kapot kunnen, en daarom getest worden:
 *
 * 1. Een sleutel die niet stabiel is. De unieke index op `(agent, key)` maakt
 *    van een gelijke sleutel een upsert; loopt de slug per aanroep uiteen, dan
 *    krijg je elke dag een nieuwe rij in plaats van een bijgewerkte.
 * 2. Een map die naar een hub wijst die niet bestaat. Dan valt hij in de
 *    Memory-tab stil weg, en dat is precies de klasse fout waar `hubClassifier`
 *    al eens doorheen is gegaan.
 */
import { describe, it, expect } from 'vitest';
import {
  MAPPEN, hubVoorMap, isAxeMap, mapDef, mapSleutel, mapVanSleutel, type AxeMap,
} from './mappen';
import { HUB_BY_ID } from './memoryHubs';
import { hubForAgentRow, AGENT_HUB_CASE } from './hubClassifier';
import { MEMORY_KINDS } from './memoryKind';

describe('de tabel', () => {
  it('heeft vier mappen, elk één keer', () => {
    expect(MAPPEN).toHaveLength(4);
    expect(new Set(MAPPEN.map((m) => m.id)).size).toBe(4);
  });

  it('wijst elke map naar een hub die echt bestaat', () => {
    for (const m of MAPPEN) {
      expect(HUB_BY_ID[m.hub], `${m.id} → ${m.hub}`).toBeDefined();
    }
  });

  it('gebruikt alleen soorten die de tabel kent', () => {
    for (const m of MAPPEN) {
      expect(MEMORY_KINDS, m.id).toContain(m.kind);
    }
  });

  it('zegt van elke map waarvoor hij is', () => {
    for (const m of MAPPEN) expect(m.waarvoor.length, m.id).toBeGreaterThan(20);
  });
});

describe('mapSleutel', () => {
  it('maakt een leesbare, stabiele sleutel', () => {
    expect(mapSleutel('wiki', 'AXE Core routes')).toBe('wiki/axe-core-routes');
    expect(mapSleutel('inbox', 'Briefje 2026-10-01')).toBe('inbox/briefje-2026-10-01');
  });

  it('geeft twee keer hetzelfde voor dezelfde naam -- anders is de upsert geen upsert', () => {
    expect(mapSleutel('projects', 'Trading desk opschonen'))
      .toBe(mapSleutel('projects', 'trading   DESK opschonen'));
  });

  it('houdt rare invoer binnen de perken', () => {
    expect(mapSleutel('content', '')).toBe('content/zonder-naam');
    expect(mapSleutel('content', '!!!')).toBe('content/zonder-naam');
    expect(mapSleutel('content', 'café déjà vu')).toBe('content/cafe-deja-vu');
    expect(mapSleutel('wiki', 'x'.repeat(200)).length).toBeLessThanOrEqual(65);
  });

  it('leest zijn eigen sleutel terug', () => {
    for (const m of MAPPEN) {
      expect(mapVanSleutel(mapSleutel(m.id, 'iets'))).toBe(m.id);
    }
  });

  it('noemt niets een map dat er geen is', () => {
    for (const k of ['', 'report/123', 'zomaar', 'INBOXX/x', null, undefined]) {
      expect(mapVanSleutel(k), String(k)).toBeNull();
    }
    for (const v of ['inboxx', 'Project', 'wik', 42, null]) {
      expect(isAxeMap(v), String(v)).toBe(false);
      expect(mapDef(v as string), String(v)).toBeNull();
    }
  });

  it('leest een hoofdletterige sleutel wel', () => {
    // De sleutel komt soms terug uit de database, en daar is niets afgedwongen.
    expect(mapVanSleutel('WIKI/iets')).toBe('wiki');
  });
});

describe('de classificatie kijkt naar de map', () => {
  /* Zonder deze regel viel alles wat niet de trader, intel of companion is in
     `insights` -- dus alle vier de mappen op dezelfde berg. */
  it('zet elke map op zijn eigen hub, ongeacht wie het opschreef', () => {
    for (const m of MAPPEN) {
      expect(hubForAgentRow('global', m.id), m.id).toBe(hubVoorMap(m.id));
      expect(hubForAgentRow('axe_code', m.id), m.id).toBe(hubVoorMap(m.id));
    }
  });

  it('laat de oude regels staan waar er geen map is', () => {
    expect(hubForAgentRow('axe_trader')).toBe('trading');
    expect(hubForAgentRow('axe_intel')).toBe('agents');
    expect(hubForAgentRow('axe_code')).toBe('insights');
    expect(hubForAgentRow('global', 'cli_audit')).toBe('insights');
  });

  /* De JS-regel en de SQL-regel zijn een tweeling, en in dit bestand zijn die
     al eens uit elkaar gelopen. Daarom staat elke map ook in de SQL. */
  it('noemt elke map ook in de SQL-tak', () => {
    for (const m of MAPPEN) {
      expect(AGENT_HUB_CASE, m.id).toContain(`WHEN category = '${m.id}' THEN '${m.hub}'`);
    }
    // De map vóór de namespace: anders wint de trader van een wiki-artikel.
    const eersteMap = AGENT_HUB_CASE.indexOf("category = '");
    const trader = AGENT_HUB_CASE.indexOf("agent = 'axe_trader'");
    expect(eersteMap).toBeGreaterThan(0);
    expect(trader).toBeGreaterThan(eersteMap);
  });
});

describe('elke map is bruikbaar als map', () => {
  it('heeft een def die je op zijn id vindt', () => {
    for (const m of MAPPEN) expect(mapDef(m.id)).toBe(m);
  });

  it('dekt het hele type -- geen map zonder definitie', () => {
    const alle: AxeMap[] = ['inbox', 'projects', 'content', 'wiki'];
    for (const id of alle) expect(mapDef(id), id).not.toBeNull();
  });
});
