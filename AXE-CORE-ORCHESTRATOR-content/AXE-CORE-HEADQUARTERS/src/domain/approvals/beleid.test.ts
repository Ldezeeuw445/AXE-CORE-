import { describe, expect, it } from 'vitest';
import {
  STANDAARD_REGELS,
  classificeer,
  evalueer,
  magLukaCategorieVrijgeven,
  type BeleidRegel,
  type Kenmerk,
} from './beleid';

function k(deels: Partial<Kenmerk> = {}): Kenmerk {
  return { kind: 'reply_draft', ...deels };
}

describe('classificeer: ernstige dingen eerst, daarna routine', () => {
  it('prijs, fee of percentage in de tekst is altijd price', () => {
    expect(classificeer(k({ body: 'We can do 8,450 USD per MT CIF Rotterdam.' }))).toBe('price');
    expect(classificeer(k({ body: 'Our commission is 2%.' }))).toBe('price');
    expect(classificeer(k({ subject: 'Offer $50/MT' }))).toBe('price');
  });

  it('NCNDA, IMFPA, SPA of een juridische bijlage is contract', () => {
    expect(classificeer(k({ body: 'Please find the NCNDA attached.' }))).toBe('contract');
    expect(classificeer(k({ legalAttachment: true, body: 'See attached.' }))).toBe('contract');
  });

  it('hoeveelheid plus CIF/FOB met haven is commitment, niet een chase', () => {
    expect(classificeer(k({
      hasThread: true,
      body: 'We can ship 500 MT CIF Rotterdam in December.',
    }))).toBe('commitment');
  });

  it('identiteit van buyer/seller delen is identity_disclosure', () => {
    expect(classificeer(k({ body: 'We will introduce you to the buyer, Harcros.' }))).toBe('identity_disclosure');
    expect(classificeer(k({ identityDisclosure: true }))).toBe('identity_disclosure');
  });

  it('deal naar negotiation/closing of stoppen is deal_move', () => {
    expect(classificeer(k({ kind: 'deal_decision', dealStageMove: true }))).toBe('deal_move');
  });

  it('Harcros of een risk-flag is risk_counterparty, ook bij een chase', () => {
    expect(classificeer(k({ hasThread: true, riskCounterparty: true, body: 'Just checking in.' }))).toBe('risk_counterparty');
  });

  it('antwoord op inbound met een offer escaleert', () => {
    expect(classificeer(k({ hasThread: true, inboundHasOffer: true, body: 'Thanks, we will review.' }))).toBe('inbound_offer');
  });

  it('bounces gaan nooit de deur uit', () => {
    expect(classificeer(k({ bounced: true, toEmail: 'old@x.com' }))).toBe('bounce');
  });

  it('wijziging van send-flags is policy_change', () => {
    expect(classificeer(k({ policyChange: true }))).toBe('policy_change');
  });

  it('generieke engine supply-qualification is generic_qualification', () => {
    expect(classificeer(k({
      subject: 'Copper Cathode — supply qualification',
      generatedBy: 'northsea-mcp',
      genericTemplate: true,
      body: 'Dear Sir or Madam, please confirm allocation.',
    }))).toBe('generic_qualification');
  });

  it('engine-vervolg in een thread is chase, geen auto-reject als generic_qualification', () => {
    const kenmerk = k({
      hasThread: true,
      generatedBy: 'northsea-engine',
      genericTemplate: true,
      namedRecipient: false,
      isRoleMailbox: true,
      addressVerified: true,
      subject: 'Re: Copper Cathode — supply qualification',
      body: 'Dear colleagues at Finolex,\n\nI am following up on our earlier email.',
    });
    expect(classificeer(kenmerk)).toBe('chase');
    const uit = evalueer(kenmerk);
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
  });

  it('chase: follow-up in bestaande thread, geen prijs', () => {
    expect(classificeer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      body: 'Hi Chanda, just following up on the documents we asked for last week.',
    }))).toBe('chase');
  });

  it('eerste contact, gepersonaliseerd, is cold_outreach', () => {
    expect(classificeer(k({
      hasThread: false,
      namedRecipient: true,
      addressVerified: true,
      personalized: true,
      body: 'Aurubis — we are reviewing copper cathode supply and would like to understand your current allocation.',
    }))).toBe('cold_outreach');
  });

  it('vraag om specs/assay/call/KYC is nonbinding', () => {
    expect(classificeer(k({
      hasThread: true,
      body: 'Could you share the latest assay and the intended destination?',
    }))).toBe('nonbinding');
  });

  it('interne opruiming is internal', () => {
    expect(classificeer(k({ kind: 'action_queue_approval', internalHousekeeping: true }))).toBe('internal');
  });

  it('weet hij het niet, dan unsure', () => {
    expect(classificeer(k({ body: '…' }))).toBe('unsure');
  });
});

describe('evalueer: conservatieve NorthSea-defaults', () => {
  it('chase mag auto-approve als de extra drempels kloppen, nooit als human', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      chases14dForContact: 1,
      body: 'Hi Chanda, following up on the COA.',
    }));
    expect(uit.mode).toBe('auto_approve');
    expect(uit.category).toBe('chase');
    expect(uit.actorType).toBe('axe_policy');
    expect(uit.needsLuka).toBe(false);
    expect(uit.reason).toMatch(/chase/i);
  });

  it('persoonlijke follow-up die de vorige mail noemt mag auto-approve', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      chases14dForContact: 0,
      body: 'Dear Chanda,\n\nI am following up with Mopani Copper Mines PLC on our email of 19 November ("Copper Cathode — supply qualification"), in which we asked whether you could confirm origin and the documents package.\n\nKind regards',
    }));
    expect(uit.mode).toBe('auto_approve');
    expect(uit.category).toBe('chase');
    expect(uit.needsLuka).toBe(false);
  });

  it('generieke aanhef faalt auto-approve, ook met namedRecipient uit het contactrecord', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      chases14dForContact: 0,
      body: 'Dear Sir or Madam,\n\nFollowing up on our previous message about copper cathode.',
    }));
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
    expect(uit.reason).toMatch(/generic salutation/i);
  });

  it('follow-up zonder persoonsnaam (alleen rol/bedrijf) gaat naar review, niet auto', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: false,
      isRoleMailbox: true,
      addressVerified: true,
      body: 'Dear colleagues at Finolex,\n\nI am following up on our earlier email.',
    }));
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
    expect(uit.reason).toMatch(/named person/i);
  });

  it('verboden claims in een chase (LME registered, CIF-aanbod, levergarantie) escaleren', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      body: 'Dear Chanda,\n\nWe are LME registered and can deliver next week CIF Rotterdam.',
    }));
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
  });

  it('derde chase in 14 dagen escaleert', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      chases14dForContact: 2,
      body: 'Hi Chanda, following up again.',
    }));
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
  });

  it('chase zonder geverifieerd adres escaleert', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: false,
      body: 'Hi, following up.',
    }));
    expect(uit.mode).toBe('escalate');
  });

  it('cold outreach mag auto-approve tot de daglimiet, niet daarboven', () => {
    const basis = k({
      namedRecipient: true,
      addressVerified: true,
      personalized: true,
      dnc: false,
      contactedWithinDays: 20,
      body: 'Aurubis — reviewing copper cathode supply for a specific European buyer programme.',
    });
    expect(evalueer({ ...basis, firstContactsToday: 29 }).mode).toBe('auto_approve');
    expect(evalueer({ ...basis, firstContactsToday: 30 }).mode).toBe('escalate');
  });

  it('sales@ is een geldig eerste-contactadres; DNC of contact <7 dagen niet', () => {
    const ok = evalueer(k({
      toEmail: 'sales@aurubis.com',
      isRoleMailbox: true,
      addressVerified: true,
      personalized: true,
      body: 'Aurubis — reviewing copper cathode supply for a European programme.',
    }));
    expect(ok.mode).toBe('auto_approve');
    expect(evalueer(k({
      namedRecipient: true, addressVerified: true, personalized: true, dnc: true,
      body: 'Hi — reviewing copper cathode.',
    })).mode).toBe('escalate');
    expect(evalueer(k({
      namedRecipient: true, addressVerified: true, personalized: true, contactedWithinDays: 3,
      body: 'Hi — reviewing copper cathode.',
    })).mode).toBe('escalate');
  });

  it('verboden claims (LME registered, tonnage/CIF-aanbod, levergarantie) escaleren', () => {
    expect(evalueer(k({
      namedRecipient: true, addressVerified: true, personalized: true,
      body: 'Aurubis — we are LME registered and can deliver next week.',
    })).category).toBe('commitment');
  });

  it('sensitive chase escaleert, ook als de drempels verder kloppen', () => {
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: true,
      addressVerified: true,
      chases14dForContact: 1,
      sensitive: true,
      body: 'Hi Chanda, following up on the COA.',
    }));
    expect(uit.mode).toBe('escalate');
    expect(uit.needsLuka).toBe(true);
    expect(uit.reason).toMatch(/sensitive/i);
  });

  it('sensitive + axeMayApproveAll op die categorie mag AXE wél auto-approven', () => {
    const vrij: BeleidRegel[] = STANDAARD_REGELS.map((r) =>
      r.category === 'chase' ? { ...r, axeMayApproveAll: true } : r,
    );
    const uit = evalueer(k({
      hasThread: true,
      namedRecipient: false,
      sensitive: true,
      body: 'Following up.',
    }), vrij);
    expect(uit.mode).toBe('auto_approve');
    expect(uit.actorType).toBe('axe_policy');
  });

  it('generieke supply-qualification wordt auto-REJECT, niet human', () => {
    const uit = evalueer(k({
      subject: 'Copper Cathode — supply qualification',
      generatedBy: 'northsea-engine',
      genericTemplate: true,
      body: 'Dear Sir or Madam, please confirm allocation.',
    }));
    expect(uit.mode).toBe('auto_reject');
    expect(uit.actorType).toBe('axe_policy');
    expect(uit.needsLuka).toBe(false);
  });

  it('prijs, contract, deal-move, identiteit, bounce, policy: altijd Luka', () => {
    const gevallen: Kenmerk[] = [
      k({ body: 'Price indication 8400 USD/MT' }),
      k({ body: 'Please sign the IMFPA' }),
      k({ dealStageMove: true, kind: 'deal_decision' }),
      k({ identityDisclosure: true }),
      k({ bounced: true }),
      k({ policyChange: true }),
    ];
    for (const g of gevallen) {
      const uit = evalueer(g);
      expect(uit.mode, uit.category).toBe('escalate');
      expect(uit.needsLuka).toBe(true);
      expect(uit.actorType).toBe('human');
    }
  });

  it('inbound met offer: alleen een non-binding specs-vraag mag auto, termen escaleren', () => {
    const vraag = evalueer(k({
      hasThread: true,
      inboundHasOffer: true,
      body: 'Thanks for the note. Could you share specs, volume and destination?',
    }));
    expect(vraag.mode).toBe('auto_approve');
    expect(vraag.category).toBe('nonbinding');

    const termen = evalueer(k({
      hasThread: true,
      inboundHasOffer: true,
      body: 'We can take 500 MT CIF Rotterdam at 8400 USD per MT.',
    }));
    expect(termen.mode).toBe('escalate');
    expect(termen.needsLuka).toBe(true);
  });

  it('onzeker escaleert', () => {
    expect(evalueer(k({ body: '??' })).mode).toBe('escalate');
  });
});

describe('Luka-schakelaar: AXE may approve everything in category X', () => {
  it('alleen Luka mag die schakelaar zetten', () => {
    expect(magLukaCategorieVrijgeven('luka')).toBe(true);
    expect(magLukaCategorieVrijgeven('northseamgr')).toBe(false);
    expect(magLukaCategorieVrijgeven('axe-core')).toBe(false);
  });

  it('zet hij chase vrij, dan vallen extra drempels weg — prijs blijft Luka', () => {
    const vrij: BeleidRegel[] = STANDAARD_REGELS.map((r) =>
      r.category === 'chase' ? { ...r, axeMayApproveAll: true } : r,
    );
    const chase = evalueer(k({
      hasThread: true,
      namedRecipient: false,
      addressVerified: false,
      chases14dForContact: 9,
      body: 'Following up.',
    }), vrij);
    expect(chase.mode).toBe('auto_approve');

    const prijs = evalueer(k({ body: 'Commission 3%.' }), vrij);
    expect(prijs.mode).toBe('escalate');
    expect(prijs.category).toBe('price');
  });

  it('axeMayApproveAll op price laat AXE die categorie, en alleen die, auto-approven', () => {
    const vrij: BeleidRegel[] = STANDAARD_REGELS.map((r) =>
      r.category === 'price' ? { ...r, mode: 'auto_approve', axeMayApproveAll: true } : r,
    );
    const prijs = evalueer(k({ body: 'Indication 8400 USD per MT' }), vrij);
    expect(prijs.mode).toBe('auto_approve');
    expect(prijs.actorType).toBe('axe_policy');
    const contract = evalueer(k({ body: 'Please sign the NCNDA' }), vrij);
    expect(contract.mode).toBe('escalate');
  });

  it('auto-approve markeert nooit human en raakt auto_send_* niet', () => {
    const uit = evalueer(k({
      hasThread: true, namedRecipient: true, addressVerified: true,
      body: 'Hi Chanda, following up on the COA.',
    }));
    expect(uit.actorType).not.toBe('human');
    expect(uit.marksHumanApproved).toBe(false);
    expect(uit.flipsAutoSend).toBe(false);
  });
});
