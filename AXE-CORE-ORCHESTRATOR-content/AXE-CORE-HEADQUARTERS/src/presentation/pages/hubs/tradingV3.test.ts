import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Trading v3 batch', () => {
  it('hub is a KPI dashboard that routes to Desk, Intel and the journal', () => {
    // 25 nov: van zes grote tegels naar KPI's, grafiekjes en acties. De wegen
    // naar Desk/Intel/Memory blijven, nu als knoppen in de kop en op de kaarten.
    const hub = readFileSync(resolve(__dirname, 'TradingDemoHub.tsx'), 'utf8');
    for (const pad of ['/trading-desk', '/trading-intel', '/memory/trading']) expect(hub).toContain(pad);
    for (const kpi of ['Account', 'Equity', 'Open P&L', 'Closed P&L', 'Win rate', 'Circuit breaker']) expect(hub).toContain(`label="${kpi}"`);
    expect(hub).toContain('listTrades(');
    expect(hub).toContain('No closed trades yet, so no curve');
    // Demo-hub: geen order-knoppen, ook geen demo-orders vanaf hier.
    expect(hub).not.toMatch(/placeOrder|executeDemoTrade|createMarket(Buy|Sell)Order/);
  });
  it('desk + intel tagged v3', () => {
    const desk = readFileSync(resolve(__dirname, '../Trading.tsx'), 'utf8');
    const intel = readFileSync(resolve(__dirname, '../TradingIntel.tsx'), 'utf8');
    expect(desk).toContain('data-axe-trading-desk="v3"');
    expect(intel).toContain('data-axe-trading-intel="v3"');
  });
});
