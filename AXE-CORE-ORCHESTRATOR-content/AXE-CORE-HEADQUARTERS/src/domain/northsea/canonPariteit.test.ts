/**
 * Pariteit met de NorthSea MCP (backend/northsea_mcp/northsea_mcp/canon.py).
 *
 * De MCP rekent dezelfde dashboardgetallen uit in Python. Dit bestand en
 * tests/test_canon.py lezen DEZELFDE gevallen; verandert een regel hier, dan
 * faalt deze test tot canon.py (en de fixtures) mee zijn aangepast.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import wereld from 'world-atlas/countries-50m.json';
import { bouwKaart, dealStand, isActief, losOp, type KaartDeal } from './kaart';

const FIX = JSON.parse(readFileSync(resolve(__dirname, '../../../backend/northsea_mcp/tests/canon_fixtures.json'), 'utf8'));
const LANDEN = JSON.parse(readFileSync(resolve(__dirname, '../../../backend/northsea_mcp/northsea_mcp/data/landen.json'), 'utf8')).namen as string[];

// Alleen de namen tellen voor plaatsbepaling; de coördinaten doen er voor de telling niet toe.
const middelpunten = new Map<string, [number, number]>(LANDEN.map(n => [n, [0, 0]]));

const STAND: Record<string, string> = { actief: 'active', gematcht: 'matched', geblokkeerd: 'blocked', afgerond: 'completed', overig: 'other' };
const BRON: Record<string, string> = { laadhaven: 'loading_port', herkomst: 'origin', bestemming: 'destination', vestiging: 'establishment' };
const REDEN: Record<string, string> = { leeg: 'empty', meerdere: 'multiple', regio: 'region', onbekend: 'unknown' };

function naarKaartDeal(d: Record<string, unknown>): KaartDeal {
  return {
    id: d.id, stage: d.stage, execution_state: d.execution_state, geblokkeerd: !!(d.primary_blocker as string | null)?.trim(),
    laadhaven: d.loading_port, herkomst: d.origin, leverancier_stad: d.supplier_city, leverancier_land: d.supplier_country,
    bestemming: d.destination, koper_stad: d.buyer_city, koper_land: d.buyer_country,
  } as unknown as KaartDeal;
}

describe('pariteit met de MCP (canon_fixtures.json)', () => {
  it('de landenlijst van de MCP is die van de kaart', () => {
    const topo = wereld as unknown as Parameters<typeof feature>[0];
    const namen = (feature(topo, (topo as unknown as { objects: { countries: never } }).objects.countries) as unknown as { features: { properties: { name?: string } }[] })
      .features.map(f => f.properties?.name).filter(Boolean);
    expect([...new Set(namen)].sort()).toEqual(LANDEN);
  });

  it('actief en stand', () => {
    for (const d of FIX.deals) {
      const k = naarKaartDeal(d);
      expect(isActief(k), d.id).toBe(d.expect.active);
      expect(STAND[dealStand(k)], d.id).toBe(d.expect.state);
    }
  });

  it('routes en niet geplaatst', () => {
    const kaart = bouwKaart(FIX.deals.map(naarKaartDeal), middelpunten);
    for (const d of FIX.deals) {
      const r = kaart.routes.find(x => x.id === d.id);
      if (d.expect.route) {
        expect(r, d.id).toBeTruthy();
        expect([r!.van.label, BRON[r!.vanBron], r!.naar.label, BRON[r!.naarBron], r!.benaderd], d.id).toEqual(d.expect.route);
      } else {
        const n = kaart.nietGeplaatst.find(x => x.deal.id === d.id)!;
        expect([n.kant === 'beide' ? 'both' : n.kant === 'leverancier' ? 'supplier' : 'buyer', REDEN[n.reden]], d.id)
          .toEqual([d.expect.not_placed_side, d.expect.not_placed_reason]);
      }
    }
  });

  it('plaatsen', () => {
    for (const [tekst, label, reden] of FIX.places) {
      const { locatie, reden: r } = losOp(tekst, middelpunten);
      expect([locatie?.label ?? null, r ? REDEN[r] : null], tekst).toEqual([label, reden]);
    }
  });
});
