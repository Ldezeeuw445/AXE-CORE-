import { describe, expect, it } from 'vitest';
import {
  beoordeelKoppeling, berichtHoortBijDeal, isCommercieelBericht, isVolgendeActieVerlopen,
  koppelTellers, normOnderwerp, threadMessageIds,
} from './koppeling';
import type { Bericht, DealDetail } from './tabs/typen';

const harcros = 'co-harcros';
const pitsonel = 'co-pitsonel';
const rung = 'co-rung';
const aurubis = 'co-aurubis';

const qinzhou: DealDetail = {
  id: '4467f6b1-qinzhou', stage: 'identified',
  koper: { id: 'buyer-p', naam: 'Preston' }, leverancier: { id: harcros, naam: 'Harcros Chemi Ltd' },
  vraag: { product: 'Copper Cathode', volume_mt: 100, bestemming: 'Qinzhou Port, China', incoterm: 'CIF' },
};
const hamburg: DealDetail = {
  id: '919e0543-hamburg', stage: 'identified',
  koper: { id: 'buyer-a', naam: 'Ahad' }, leverancier: { id: harcros, naam: 'Harcros Chemi Ltd' },
  vraag: { product: 'Copper Cathode', volume_mt: 25, bestemming: 'Hamburg, Germany', incoterm: 'CIF' },
};
const pitsonelDeal: DealDetail = {
  id: 'e3aafbd0-pitsonel', stage: 'identified',
  koper: { id: 'buyer-k', naam: 'Klaus' }, leverancier: { id: pitsonel, naam: 'Pitsonel Ltd' },
  vraag: { product: 'Copper Cathodes', bestemming: 'Germany' },
};
const riceDeal: DealDetail = {
  id: 'c116c680-rice', stage: 'identified',
  koper: { id: 'cargo', naam: 'The Cargo Room' }, leverancier: { id: 'tbs', naam: 'TBS Ricemill' },
  vraag: { product: 'Thai long-grain white rice', bestemming: 'Jebel Ali, Dubai, UAE' },
};
const aurubisA: DealDetail = {
  id: 'aur-1', stage: 'identified',
  koper: { id: 'b1', naam: 'Buyer 1' }, leverancier: { id: aurubis, naam: 'Aurubis AG' },
  vraag: { product: 'Copper Cathode', bestemming: 'China', volume_mt: 5000 },
};
const aurubisB: DealDetail = {
  id: 'aur-2', stage: 'identified',
  koper: { id: 'b2', naam: 'Buyer 2' }, leverancier: { id: aurubis, naam: 'Aurubis AG' },
  vraag: { product: 'Copper Cathode', bestemming: 'Germany / Italy', volume_mt: 500 },
};

const deals = [qinzhou, hamburg, pitsonelDeal, riceDeal, aurubisA, aurubisB];

const bericht = (p: Partial<Bericht> & { id: string }): Bericht => p;

describe('isCommercieelBericht', () => {
  it('houdt test, intern, DSN en platformmail buiten de dealstaat', () => {
    expect(isCommercieelBericht({ test: true, onderwerp: 'Copper' })).toBe(false);
    expect(isCommercieelBericht({ richting: 'internal', onderwerp: 'note' })).toBe(false);
    expect(isCommercieelBericht({ onderwerp: 'Trade Center: automation heartbeat' })).toBe(false);
    expect(isCommercieelBericht({ onderwerp: 'Undelivered Mail Returned to Sender' })).toBe(false);
    expect(isCommercieelBericht({ onderwerp: 'Do You like an Empty Pawn Shop?' })).toBe(false);
    expect(isCommercieelBericht({ onderwerp: 'WhatsApp-verificatiecode: 310-802' })).toBe(false);
    expect(isCommercieelBericht({ onderwerp: 'KaiCalls: call.completed' })).toBe(false);
    expect(isCommercieelBericht({ intelligentie: { classificatie: 'internal' }, onderwerp: 'Supplier' })).toBe(false);
    expect(isCommercieelBericht({ richting: 'inbound', onderwerp: 'Re: 100 MT Copper CIF Qinzhou' })).toBe(true);
  });
});

describe('beoordeelKoppeling', () => {
  it('een opgeslagen opportunity_id is LINKED, ook zonder mapping_status', () => {
    const o = beoordeelKoppeling(bericht({ id: '1', deal_id: qinzhou.id, bedrijf_id: harcros }), deals);
    expect(o).toMatchObject({ klasse: 'LINKED', dealId: qinzhou.id, basis: 'stored_opportunity_id' });
  });

  it('schrijft nooit: HIGH is een weergave, de rij blijft zonder deal_id', () => {
    const b = bericht({ id: 'p-in', richting: 'inbound', bedrijf_id: pitsonel, onderwerp: 'Re: LME Grade A Copper Cathodes — 25 MT / Germany / LC' });
    const o = beoordeelKoppeling(b, deals);
    expect(b.deal_id).toBeUndefined();
    expect(o.klasse).toBe('HIGH_CONFIDENCE_MATCH');
    expect(o.dealId).toBe(pitsonelDeal.id);
    expect(o.basis).toBe('counterparty_single_open_opportunity');
  });

  it('Qinzhou-termen winnen van meerdere Harcros-deals, Hamburg-termen van dezelfde inbox wijzen ergens anders heen', () => {
    const inQinzhou = bericht({
      id: 'h-in', richting: 'inbound', bedrijf_id: harcros, contact_email: 'sales@harcroschemi.com',
      onderwerp: 'Re: 100 MT Copper Cathode Trial — CIF Qinzhou / Sight DLC | Qualification',
      koppeling: 'ambiguous', koppeling_basis: 'counterparty_multiple_open_opportunities',
    });
    const uitHamburg = bericht({
      id: 'h-out', richting: 'outbound', bedrijf_id: harcros,
      onderwerp: 'Copper Cathode Requirement — 25 MT Trial / CIF Hamburg / LC',
    });
    const corpus: Bericht[] = [
      bericht({ id: 'linked', deal_id: qinzhou.id, bedrijf_id: harcros, contact_email: 'sales@harcroschemi.com', onderwerp: '100 MT Copper Cathode Trial — CIF Qinzhou / Sight DLC | Qualification' }),
      inQinzhou, uitHamburg,
    ];
    const q = beoordeelKoppeling(inQinzhou, deals, corpus);
    const h = beoordeelKoppeling(uitHamburg, deals, corpus);
    expect(q).toMatchObject({ klasse: 'HIGH_CONFIDENCE_MATCH', dealId: qinzhou.id, basis: 'commercial_terms_unique' });
    expect(h).toMatchObject({ klasse: 'HIGH_CONFIDENCE_MATCH', dealId: hamburg.id, basis: 'commercial_terms_unique' });
    expect(q.dealId).not.toBe(h.dealId);
  });

  it('een Rung-antwoord op een al opgeslagen rijst-thread is HIGH via geschiedenis, zonder Rung als partij op de deal', () => {
    const inbound = bericht({
      id: 'r-in', richting: 'inbound', bedrijf_id: rung, contact_email: 'info@rungtaweewattanacoltd.com',
      onderwerp: 'Re: Thai White Rice 5% Broken — CFR Jebel Ali / LC Qualification',
    });
    const corpus: Bericht[] = [
      bericht({
        id: 'r-out', richting: 'outbound', bedrijf_id: rung, deal_id: riceDeal.id,
        onderwerp: 'Thai White Rice 5% Broken — CFR Jebel Ali / LC Qualification',
      }),
      inbound,
    ];
    const o = beoordeelKoppeling(inbound, deals, corpus);
    expect(o).toMatchObject({ klasse: 'HIGH_CONFIDENCE_MATCH', dealId: riceDeal.id, basis: 'thread_subject_counterparty' });
  });

  it('Aurubis met meerdere open deals en geen unieke termen blijft AMBIGUOUS', () => {
    const o = beoordeelKoppeling(bericht({
      id: 'au', richting: 'outbound', bedrijf_id: aurubis,
      onderwerp: 'Copper Cathode Requirement — 25 MT Trial / Hamburg',
    }), deals);
    expect(o.klasse).toBe('AMBIGUOUS');
    expect(o.dealId).toBeNull();
    expect(o.kandidaten.map(k => k.id).sort()).toEqual(['aur-1', 'aur-2']);
  });

  it('RFC In-Reply-To op precies één eerder bericht koppelt HIGH, twee deals blijven AMBIGUOUS', () => {
    const linked = bericht({ id: 'orig', deal_id: pitsonelDeal.id, rfc_id: 'abc@mail' });
    const reply = bericht({ id: 're', richting: 'inbound', in_reply_to: '<ABC@mail>', onderwerp: 'Re: copper' });
    expect(beoordeelKoppeling(reply, deals, [linked, reply])).toMatchObject({ klasse: 'HIGH_CONFIDENCE_MATCH', basis: 'thread', dealId: pitsonelDeal.id });
    const other = bericht({ id: 'orig2', deal_id: hamburg.id, rfc_id: 'abc@mail' });
    expect(beoordeelKoppeling(reply, deals, [linked, other, reply]).klasse).toBe('AMBIGUOUS');
  });

  it('bedrijf zonder open deal en zonder thread blijft UNLINKED', () => {
    const o = beoordeelKoppeling(bericht({
      id: 'thai', richting: 'outbound', bedrijf_id: 'co-thai',
      onderwerp: 'Thai White Rice — 5% Broken / Container-Trial Capability Qualification',
    }), deals);
    expect(o).toMatchObject({ klasse: 'UNLINKED', dealId: null, commercieel: true });
    expect(o.kandidaten).toEqual([]);
  });

  it('platformmail met mapping_status=ambiguous wordt niet als dealkandidaat getoond', () => {
    const o = beoordeelKoppeling(bericht({
      id: 'spam', koppeling: 'ambiguous', bedrijf_id: harcros,
      onderwerp: 'Do You like an Empty Pawn Shop?', contact_email: 'noreply@tradewheel.com',
    }), deals);
    expect(o).toMatchObject({ klasse: 'UNLINKED', commercieel: false, dealId: null });
    expect(o.kandidaten).toEqual([]);
  });
});

describe('hulpen', () => {
  it('telt de vier klassen en herkent een verlopen next_action_at', () => {
    const tellers = koppelTellers([
      { klasse: 'LINKED', basis: '', dealId: 'a', kandidaten: [], reden: '', commercieel: true },
      { klasse: 'HIGH_CONFIDENCE_MATCH', basis: '', dealId: 'b', kandidaten: [], reden: '', commercieel: true },
      { klasse: 'AMBIGUOUS', basis: '', dealId: null, kandidaten: [], reden: '', commercieel: true },
      { klasse: 'UNLINKED', basis: '', dealId: null, kandidaten: [], reden: '', commercieel: false },
    ]);
    expect(tellers).toEqual({ LINKED: 1, HIGH_CONFIDENCE_MATCH: 1, AMBIGUOUS: 1, UNLINKED: 1 });
    const nu = Date.parse('2026-09-17T18:00:00Z');
    expect(isVolgendeActieVerlopen('2026-09-16T09:03:29Z', nu)).toBe(true);
    expect(isVolgendeActieVerlopen('2026-09-18T09:03:29Z', nu)).toBe(false);
    expect(isVolgendeActieVerlopen(null, nu)).toBe(false);
  });

  it('berichtHoortBijDeal volgt opgeslagen id of kandidaat, niet een gok', () => {
    const b = bericht({ id: 'x' });
    expect(berichtHoortBijDeal(bericht({ id: 'l', deal_id: 'd1' }), 'd1', undefined)).toBe(true);
    expect(berichtHoortBijDeal(b, 'd1', { klasse: 'HIGH_CONFIDENCE_MATCH', basis: '', dealId: 'd1', kandidaten: [], reden: '', commercieel: true })).toBe(true);
    expect(berichtHoortBijDeal(b, 'd1', { klasse: 'AMBIGUOUS', basis: '', dealId: null, kandidaten: [{ id: 'd1', label: 'x', waarom: '' }], reden: '', commercieel: true })).toBe(true);
    expect(berichtHoortBijDeal(b, 'd1', { klasse: 'UNLINKED', basis: '', dealId: null, kandidaten: [], reden: '', commercieel: true })).toBe(false);
  });

  it('haalt RFC-ids uit In-Reply-To/References zoals mapping.ts', () => {
    expect(threadMessageIds('<a@x>', '<b@x> <a@x>')).toEqual(['a@x', 'b@x']);
    expect(normOnderwerp('Re: Thai White Rice 5% Broken')).toBe('thai white rice 5% broken');
  });
});
