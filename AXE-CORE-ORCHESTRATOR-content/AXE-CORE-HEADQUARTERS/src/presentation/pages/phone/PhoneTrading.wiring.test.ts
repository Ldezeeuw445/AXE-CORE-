import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bron = readFileSync(join(__dirname, 'PhoneTrading.tsx'), 'utf8');

describe('PhoneTrading', () => {
  it('tekent geen CompanionChart en pollt MetaAPI niet zelf', () => {
    expect(bron).not.toContain('CompanionChart');
    expect(bron).not.toContain('useLiveChartPolling');
    expect(bron).not.toContain('metaApiGetPositions');
    expect(bron).not.toContain('metaApiGetOrders');
    expect(bron).toContain('leesPhonePosities');
    expect(bron).toContain('lockscreenSnapshot');
    expect(bron).toContain('Chart paused.');
    expect(bron).toContain('pos.tekst');
    expect(bron).not.toMatch(/\bBuy\b|\bSell\b/);
  });
});
