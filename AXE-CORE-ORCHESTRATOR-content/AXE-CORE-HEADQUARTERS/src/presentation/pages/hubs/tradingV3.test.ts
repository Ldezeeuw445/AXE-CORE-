import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Trading v3 batch', () => {
  it('hub uses HubV3 tiles Desk/Intel/Memory', () => {
    const hub = readFileSync(resolve(__dirname, 'TradingDemoHub.tsx'), 'utf8');
    expect(hub).toContain('HubV3');
    expect(hub).toContain("label: 'Desk'");
    expect(hub).toContain("label: 'Intel'");
    expect(hub).toContain('/trading-desk');
  });
  it('desk + intel tagged v3', () => {
    const desk = readFileSync(resolve(__dirname, '../Trading.tsx'), 'utf8');
    const intel = readFileSync(resolve(__dirname, '../TradingIntel.tsx'), 'utf8');
    expect(desk).toContain('data-axe-trading-desk="v3"');
    expect(intel).toContain('data-axe-trading-intel="v3"');
  });
});
