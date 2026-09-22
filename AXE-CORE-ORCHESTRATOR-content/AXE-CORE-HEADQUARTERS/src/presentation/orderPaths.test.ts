/**
 * Geen component opent zelf een positie.
 *
 * De grafiek riep brokerPlaceOrder, metaApiMarketOrder en executeDemoTrade
 * rechtstreeks aan, en omzeilde daarmee elke risicocontrole. Orders gaan nu via
 * application/tradingIntel/manualOrders (de poort). Deze test leest de bron:
 * een nieuwe knop die de poort overslaat, faalt hier in plaats van live.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VERBODEN = ['brokerPlaceOrder', 'brokerPlacePendingOrder', 'metaApiMarketOrder', 'metaApiPendingOrder', 'executeDemoTrade'];

function bestanden(dir: string): string[] {
  return readdirSync(dir).flatMap(naam => {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

describe('orderpaden in de presentatielaag', () => {
  it('roepen geen broker- of papieren orderfunctie rechtstreeks aan', () => {
    const root = join(__dirname);
    const overtreders = bestanden(root).flatMap(pad => {
      const code = readFileSync(pad, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return VERBODEN.filter(f => new RegExp(`\\b${f}\\b`).test(code)).map(f => `${pad.slice(root.length + 1)}: ${f}`);
    });
    expect(overtreders).toEqual([]);
  });
});
