/**
 * corporateJets ging via de Supabase `intel-proxy` actie `corporateJets`,
 * die een ingelogde gebruiker of een (opgezegd) Unusual Whales-token wil en
 * dus altijd 401 gaf — zie intel_wereld.py (9 nov 2026). Dit bewijst dat
 * fetchCorporateJets nu de VPS' eigen /osint/air leest, waar dezelfde
 * ADS-B-feed al zonder proxy of login draait.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const osintLayer = vi.fn();
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  osintLayer: (...a: unknown[]) => osintLayer(...a),
}));

import { fetchCorporateJets } from './intelProxyGateway';

beforeEach(() => {
  osintLayer.mockReset();
});

describe('fetchCorporateJets', () => {
  it('leest /osint/air en houdt alleen is_corporate over', async () => {
    osintLayer.mockResolvedValue({
      status: 'ok', fetched_at: 't', count: 2,
      items: [
        { icao24: 'a835af', lat: 30.0, lon: -97.0, altitude_ft: 41000, speed_kt: 480,
          owner: 'Elon Musk (Tesla/SpaceX/xAI)', aircraft_model: 'Gulfstream G650ER', is_corporate: true },
        { icao24: 'ae01', lat: 1.0, lon: 2.0, altitude_ft: 30000, speed_kt: 450,
          callsign: 'RCH1', is_corporate: false },
      ],
    });
    const jets = await fetchCorporateJets();
    expect(osintLayer).toHaveBeenCalledWith('air');
    expect(jets).toHaveLength(1);
    expect(jets[0]).toMatchObject({
      id: 'jet-a835af', lat: 30.0, lon: -97.0, altitude: 41000, speed: 480,
      operator: 'Elon Musk (Tesla/SpaceX/xAI)', detail: 'Gulfstream G650ER', source: 'ADS-B',
    });
  });

  it('geeft een lege lijst als de VPS de laag niet kon ophalen', async () => {
    osintLayer.mockResolvedValue({ status: 'error', fetched_at: 't', count: 0, items: [], error: 'adsb_lol onbereikbaar' });
    expect(await fetchCorporateJets()).toEqual([]);
  });

  it('geeft een lege lijst als /osint/air zelf faalt', async () => {
    osintLayer.mockRejectedValue(new Error('network down'));
    expect(await fetchCorporateJets()).toEqual([]);
  });
});
