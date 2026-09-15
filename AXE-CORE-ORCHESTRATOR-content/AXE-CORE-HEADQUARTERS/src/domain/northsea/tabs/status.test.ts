import { describe, expect, it } from 'vitest';
import {
  bewijsBadge, bezorgBadge, conceptBadge, gebeurtenisToon, mensLabel, poortStappen, taakBadge, verificatieBadge,
} from './status';

describe('gebeurtenisToon', () => {
  it('volgt de echte event_types uit deal_events', () => {
    expect(gebeurtenisToon('email_bounced')).toBe('rood');
    expect(gebeurtenisToon('delivery_failure')).toBe('rood');
    expect(gebeurtenisToon('email_delivery_delayed')).toBe('geel');
    expect(gebeurtenisToon('automation_review')).toBe('paars');
    expect(gebeurtenisToon('execution_engine_initialized')).toBe('paars');
    expect(gebeurtenisToon('fallback_sourcing_started')).toBe('paars');
    expect(gebeurtenisToon('email_delivered')).toBe('groen');
    expect(gebeurtenisToon('supplier_qualification_email_sent')).toBe('blauw');
    expect(gebeurtenisToon('lead_matched')).toBe('blauw');
    expect(gebeurtenisToon(null)).toBe('grijs');
  });
});

const NU = Date.parse('2026-09-15T12:00:00Z');

describe('mensLabel', () => {
  it('maakt van snake_case een leesbaar label', () => {
    expect(mensLabel('partially_corroborated')).toBe('Partially corroborated');
    expect(mensLabel('  ')).toBe('Unknown');
    expect(mensLabel(null)).toBe('Unknown');
  });
});

describe('verificatieBadge', () => {
  it('is alleen groen voor verified', () => {
    expect(verificatieBadge('verified').toon).toBe('groen');
    // Zo staan 90 van de 100 bedrijven: bezig, niet geverifieerd.
    expect(verificatieBadge('reviewing').toon).toBe('blauw');
    expect(verificatieBadge('unverified').toon).toBe('grijs');
    expect(verificatieBadge('rejected').toon).toBe('rood');
    expect(verificatieBadge(null)).toMatchObject({ toon: 'grijs', label: 'Unknown' });
  });
});

describe('bewijsBadge', () => {
  it('maakt openbare of alleen-gezegde informatie nooit groen', () => {
    for (const s of ['public_source_only', 'unverified', 'counterparty_stated', 'partial', 'partially_corroborated', '', null, 'iets_nieuws']) {
      expect(bewijsBadge(s).toon).not.toBe('groen');
    }
  });

  it('volgt de echte statussen uit deal_evidence', () => {
    expect(bewijsBadge('source_verified').toon).toBe('groen');
    expect(bewijsBadge('partially_corroborated').toon).toBe('geel');
    expect(bewijsBadge('counterparty_stated').toon).toBe('geel');
    expect(bewijsBadge('public_source_only').toon).toBe('grijs');
    expect(bewijsBadge('contradicted').toon).toBe('rood');
  });
});

describe('bezorgBadge', () => {
  it('geeft rood voor een bounce met een volgende stap, en niets zonder status', () => {
    expect(bezorgBadge('bounced')).toMatchObject({ toon: 'rood', volgende: 'Find an alternative contact' });
    expect(bezorgBadge('delayed')?.toon).toBe('geel');
    expect(bezorgBadge('delivered')?.toon).toBe('groen');
    expect(bezorgBadge(null)).toBeNull();
  });
});

describe('conceptBadge', () => {
  it('wacht op akkoord is oranje, verzonden is groen, afgewezen grijs', () => {
    expect(conceptBadge('pending', null).toon).toBe('oranje');
    expect(conceptBadge('approved', null).toon).toBe('blauw');
    expect(conceptBadge('approved', '2026-09-14T10:00:00Z').toon).toBe('groen');
    expect(conceptBadge('rejected', null).toon).toBe('grijs');
  });
});

describe('taakBadge', () => {
  it('zet een fout boven alles, dan te laat, dan akkoord', () => {
    expect(taakBadge({ status: 'open', fout: 'provider down', akkoord_nodig: true }, NU).toon).toBe('rood');
    expect(taakBadge({ status: 'open', due_at: '2026-09-14T00:00:00Z', akkoord_nodig: true }, NU).sleutel).toBe('overdue');
    expect(taakBadge({ status: 'open', akkoord_nodig: true }, NU).toon).toBe('oranje');
    expect(taakBadge({ status: 'waiting' }, NU).toon).toBe('geel');
    expect(taakBadge({ status: 'open', due_at: '2026-09-20T00:00:00Z' }, NU).toon).toBe('blauw');
    expect(taakBadge({ status: 'completed', due_at: '2026-09-01T00:00:00Z' }, NU).toon).toBe('groen');
  });
});

describe('poortStappen', () => {
  it('telt alleen expliciet true als gehaald en markeert de eerste open poort als huidig', () => {
    const stappen = poortStappen([true, true, null, true]);
    expect(stappen).toHaveLength(9);
    expect(stappen.map(s => s.staat)).toEqual(['gehaald', 'gehaald', 'huidig', 'gehaald', 'open', 'open', 'open', 'open', 'open']);
  });

  it('zonder enige gehaalde poort is de koperpoort huidig', () => {
    expect(poortStappen([])[0]).toEqual({ label: 'Buyer', staat: 'huidig' });
  });

  it('alles gehaald heeft geen huidige stap', () => {
    expect(poortStappen(Array(9).fill(true)).every(s => s.staat === 'gehaald')).toBe(true);
  });
});
