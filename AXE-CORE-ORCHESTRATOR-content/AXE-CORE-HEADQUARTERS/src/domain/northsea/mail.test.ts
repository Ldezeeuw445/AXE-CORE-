import { describe, expect, it } from 'vitest';
import {
  LEGAL_FOOTER,
  NORTHSEA_IDENTITY,
  brandedHtml,
  brandedText,
  inferMailMode,
  knownReference,
  looksLikeHtml,
  newContentHasQuotePrefixes,
  renderNorthSeaMail,
  sanitizeEmailHtml,
  splitEmailBody,
  stripQuotePrefixes,
} from './mail';

const DRAFT = `Thank you for your interest in working with NorthSea Commodity Partners.

To progress this opportunity without disclosing the buyer at this stage, please confirm the legal selling entity.

No counterparty introduction or binding commercial commitment is being made by this message.

Kind regards,
NorthSea Commodity Partners`;

const INBOUND_RFC = `Dear Luka,

We can supply 500 MT copper cathode CIF Rotterdam.

Kind regards,
Ahmed

On 12 Sep 2026, at 10:04, NorthSea Commodity Partners <trade@northseacommodity.com> wrote:
> Thank you for your interest in working with NorthSea Commodity Partners.
> To progress this opportunity please confirm origin.
> Kind regards,
> NorthSea Commodity Partners`;

describe('splitEmailBody', () => {
  it('scheidt nieuwe inhoud, handtekening en RFC-citaat', () => {
    const p = splitEmailBody(INBOUND_RFC);
    expect(p.newContent).toContain('We can supply 500 MT');
    expect(p.newContent).not.toMatch(/^\s*>/m);
    expect(p.signature).toMatch(/Ahmed/);
    expect(p.quotedHistory).toMatch(/On 12 Sep 2026/);
    expect(p.quotedHistory).toContain('> Thank you for your interest');
  });

  it('herkent Outlook Original Message', () => {
    const p = splitEmailBody('Thanks.\n\n-----Original Message-----\nFrom: trade@northseacommodity.com\nSubject: Re: copper');
    expect(p.newContent).toBe('Thanks.');
    expect(p.quotedHistory).toMatch(/Original Message/);
  });

  it('laat een bericht zonder citaat intact', () => {
    const p = splitEmailBody(DRAFT);
    expect(p.quotedHistory).toBeNull();
    expect(p.newContent).toContain('please confirm the legal selling entity');
    expect(p.signature).toMatch(/Kind regards/);
  });

  it('verwijdert > alleen van citaatregels, niet uit de commerciële tekst', () => {
    const p = splitEmailBody('Quantity > 500 MT is acceptable.\n\nKind regards,\nBuyer');
    expect(p.newContent).toContain('Quantity > 500 MT');
    expect(p.quotedHistory).toBeNull();
  });
});

describe('stripQuotePrefixes', () => {
  it('haalt RFC-prefixen weg voor visuele weergave', () => {
    expect(stripQuotePrefixes('> Thank you\n> please confirm')).toBe('Thank you\nplease confirm');
  });
});

describe('renderNorthSeaMail', () => {
  it('levert HTML en platte tekst met de geverifieerde identiteit', () => {
    const mail = renderNorthSeaMail({ body: DRAFT, mode: 'qualification' });
    expect(mail.html).toContain('NORTHSEA');
    expect(mail.html).toContain('COMMODITY PARTNERS');
    expect(mail.html).toContain(NORTHSEA_IDENTITY.name);
    expect(mail.html).toContain(NORTHSEA_IDENTITY.title);
    expect(mail.html).toContain(NORTHSEA_IDENTITY.email);
    expect(mail.html).toContain(NORTHSEA_IDENTITY.phone);
    expect(mail.html).toContain('max-width:620px');
    expect(mail.html).toContain('width=device-width');
    expect(mail.html).toContain('Qualification');
    expect(mail.text).toContain(NORTHSEA_IDENTITY.name);
    expect(mail.text).toContain(LEGAL_FOOTER[0]);
    expect(mail.html).toContain(LEGAL_FOOTER[1].slice(0, 40));
  });

  it('plaatst geen letterlijke >-prefixen in nieuw gegenereerde inhoud', () => {
    const mail = renderNorthSeaMail({ body: DRAFT, mode: 'follow_up' });
    expect(newContentHasQuotePrefixes(mail.parts.newContent)).toBe(false);
    const nieuwHtml = mail.html.split('Previous correspondence')[0];
    expect(nieuwHtml).not.toMatch(/&gt;\s*(Thank you|To progress|Kind regards)/);
    expect(mail.text.split('--- Previous correspondence ---')[0]).not.toMatch(/^>/m);
  });

  it('zet RFC-citaat in een blockquote, niet als > in de HTML-nieuwe inhoud', () => {
    const mail = renderNorthSeaMail({ body: INBOUND_RFC, mode: 'general' });
    expect(mail.html).toContain('<blockquote');
    expect(mail.html).toContain('Previous correspondence');
    expect(mail.parts.newContent).toContain('We can supply');
    expect(mail.parts.newContent).not.toContain('> Thank you');
  });

  it('laat ontbrekende transactievelden weg in plaats van ze te verzinnen', () => {
    const mail = renderNorthSeaMail({
      body: DRAFT,
      mode: 'qualification',
      reference: { deal: 'DEAL-001', commodity: 'Copper Cathode', quantity: null, destination: undefined, incoterm: '' },
    });
    expect(mail.html).toContain('DEAL-001');
    expect(mail.html).toContain('Copper Cathode');
    expect(mail.html).not.toContain('Quantity');
    expect(mail.html).not.toContain('Destination');
    expect(mail.html).not.toContain('Incoterm');
    expect(knownReference({ deal: 'DEAL-001' })).toEqual([{ label: 'Reference', value: 'DEAL-001' }]);
  });

  it('escaped HTML in de berichttekst', () => {
    const mail = renderNorthSeaMail({ body: 'Please see <script>alert(1)</script> & more.' });
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>alert');
    expect(mail.html).toContain('&amp; more');
  });

  it('houdt brandedHtml achterwaarts bruikbaar voor het bestaande send-pad', () => {
    expect(brandedHtml(DRAFT)).toContain('Luka de Zeeuw');
    expect(brandedText(DRAFT)).toContain('trade@northseacommodity.com');
  });

  it('voegt de officiële handtekening één keer toe, ook als de draft al Kind regards heeft', () => {
    const mail = renderNorthSeaMail({ body: DRAFT });
    const hits = mail.html.split(NORTHSEA_IDENTITY.name).length - 1;
    expect(hits).toBe(1);
  });
});

describe('sanitizeEmailHtml / looksLikeHtml', () => {
  it('verwijdert scripts en javascript-links', () => {
    const clean = sanitizeEmailHtml('<p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://northseacommodity.com">ok</a>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('https://northseacommodity.com');
    expect(looksLikeHtml('<html><body><p>Hi</p></body></html>')).toBe(true);
    expect(looksLikeHtml('Dear Sir,\n\nWe require 100 MT.')).toBe(false);
  });
});

describe('inferMailMode', () => {
  it('kiest de presentatiemodus uit purpose/onderwerp', () => {
    expect(inferMailMode('NorthSea MCP outreach: supplier_qualification')).toBe('qualification');
    expect(inferMailMode('Follow-up on copper cathode')).toBe('follow_up');
    expect(inferMailMode('documentation request')).toBe('document_request');
    expect(inferMailMode('protected introduction')).toBe('approval_introduction');
    expect(inferMailMode('Hello')).toBe('general');
  });
});
