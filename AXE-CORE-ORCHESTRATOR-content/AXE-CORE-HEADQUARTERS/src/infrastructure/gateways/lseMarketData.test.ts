import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalog = vi.fn();
const candles = vi.fn();

vi.mock('@/infrastructure/gateways/lseGateway', () => ({
  lseCatalog: (...a: unknown[]) => catalog(...a),
  lseCandles: (...a: unknown[]) => candles(...a),
}));

const { lseBalken, __resetLseCatalogus } =
  await import('@/infrastructure/gateways/lseMarketData');

const CATALOGUS = {
  ok: true,
  data: [
    { dataset: 'commodity', symbol: 'XAU/USD' },
    { dataset: 'index', symbol: 'NAS100/USD' },
  ],
};

/** Minuutrijen zoals LSE ze echt teruggeeft (gemeten 10 september 2026). */
function rijen(n: number, vanaf = Date.UTC(2026, 8, 8, 0, 0)) {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(vanaf + i * 60_000).toISOString().replace('T', ' ').replace('Z', '000'),
    symbol: 'XAU/USD',
    open: 4400 + i, high: 4402 + i, low: 4398 + i, close: 4401 + i, volume: 10,
  }));
}

beforeEach(() => {
  catalog.mockReset();
  candles.mockReset();
  __resetLseCatalogus();
  catalog.mockResolvedValue(CATALOGUS);
});

describe('balken van LSE', () => {
  it('vertaalt het symbool en geeft de dataset mee', async () => {
    candles.mockResolvedValue({ ok: true, data: rijen(420) });
    await lseBalken('XAUUSD', 'h1');
    expect(candles.mock.calls[0][0]).toMatchObject({ symbol: 'XAU/USD', dataset: 'commodity' });
  });

  it('vraagt ALTIJD een venster', async () => {
    // Zonder `start` geeft LSE de oudste data die hij heeft -- de eerste rij van
    // XAU/USD is van 19 maart 2006. Zo'n antwoord ziet er volkomen normaal uit.
    candles.mockResolvedValue({ ok: true, data: rijen(420) });
    await lseBalken('XAUUSD', 'h1');
    expect(candles.mock.calls[0][0].start).toBeTruthy();
  });

  it('vouwt de minuutbalken tot de gevraagde timeframe', async () => {
    // LSE negeert de gevraagde resolutie en levert altijd minuten.
    candles.mockResolvedValue({ ok: true, data: rijen(420) });
    const bars = await lseBalken('XAUUSD', 'h1');
    expect(bars).not.toBeNull();
    expect(bars!.length).toBe(7);
    expect(bars![0].o).toBe(4400);
    expect(bars![0].h).toBe(4461);
  });

  it('leest de tijd als UTC', async () => {
    candles.mockResolvedValue({ ok: true, data: rijen(420) });
    const bars = await lseBalken('XAUUSD', 'h1');
    expect(bars![0].t).toBe(Date.UTC(2026, 8, 8, 0, 0));
  });

  it('geeft null voor een symbool dat LSE niet heeft', async () => {
    // Null en geen fout: dit is een stap in een cascade, en "ik heb dit niet"
    // mag de volgende bron niet in de weg zitten.
    const bars = await lseBalken('GER40', 'h1');
    expect(bars).toBeNull();
    expect(candles).not.toHaveBeenCalled();
  });

  it('geeft null als er te weinig terugkomt om iets van te zeggen', async () => {
    candles.mockResolvedValue({ ok: true, data: rijen(2) });
    expect(await lseBalken('XAUUSD', 'h1')).toBeNull();
  });

  it('haalt de catalogus een keer op, niet per grafiek', async () => {
    candles.mockResolvedValue({ ok: true, data: rijen(420) });
    await lseBalken('XAUUSD', 'h1');
    await lseBalken('NAS100', 'h1');
    expect(catalog).toHaveBeenCalledTimes(1);
  });
});
