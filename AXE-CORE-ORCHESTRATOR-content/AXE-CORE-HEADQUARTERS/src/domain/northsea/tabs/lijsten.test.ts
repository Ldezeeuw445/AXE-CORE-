import { describe, expect, it } from 'vitest';
import {
  alsLijst, filterBedrijven, filterBerichten, geblokkeerdIn, groepeerPipeline, kolomZonderBlokkade, past, pipelineKolom, tel, volumeSom, vraagtActie,
} from './lijsten';
import type { Bedrijf, Bericht, PipelineDeal } from './typen';

describe('pipelineKolom', () => {
  it('volgt de echte uitvoeringsstatussen', () => {
    expect(pipelineKolom({ stage: 'identified', execution_state: 'matched' })).toBe('gematcht');
    expect(pipelineKolom({ stage: 'identified', execution_state: 'qualifying' })).toBe('kwalificatie');
    expect(pipelineKolom({ stage: 'identified', execution_state: 'awaiting_supplier_reply' })).toBe('wacht');
    expect(pipelineKolom({ stage: 'identified', execution_state: 'seller_lc_terms_pending' })).toBe('voorwaarden');
    expect(pipelineKolom({ stage: 'identified', execution_state: 'commercial_mismatch' })).toBe('geblokkeerd');
    expect(pipelineKolom({ stage: 'identified', execution_state: 'discovered' })).toBe('nieuw');
  });

  it('een blokkade wint, en een late fase wint van een oude uitvoeringsstatus', () => {
    expect(pipelineKolom({ stage: 'identified', execution_state: 'matched', geblokkeerd: true })).toBe('geblokkeerd');
    expect(pipelineKolom({ stage: 'negotiating', execution_state: 'qualifying' })).toBe('afronding');
  });

  it('een onbekende uitvoeringsstatus valt terug op de fase, niet weg', () => {
    expect(pipelineKolom({ stage: 'verifying', execution_state: 'iets_nieuws' })).toBe('kwalificatie');
    expect(pipelineKolom({ stage: null, execution_state: null })).toBe('nieuw');
  });
});

describe('kolomZonderBlokkade en geblokkeerdIn', () => {
  it('laat zien waar een geblokkeerde deal zonder blokkade zou staan', () => {
    const d = { stage: 'identified', execution_state: 'qualifying', geblokkeerd: true };
    expect(pipelineKolom(d)).toBe('geblokkeerd');
    expect(kolomZonderBlokkade(d)).toBe('kwalificatie');
  });

  it('telt alleen geblokkeerde deals die in die kolom thuishoren', () => {
    const deals = [
      { stage: 'identified', execution_state: 'qualifying', geblokkeerd: true },
      { stage: 'identified', execution_state: 'qualifying', geblokkeerd: false },
      { stage: 'identified', execution_state: 'matched', geblokkeerd: true },
    ];
    expect(geblokkeerdIn(deals, 'kwalificatie')).toBe(1);
    expect(geblokkeerdIn(deals, 'gematcht')).toBe(1);
    expect(geblokkeerdIn(deals, 'afronding')).toBe(0);
  });
});

describe('groepeerPipeline', () => {
  it('slaat verloren deals over en zet de laatst bijgewerkte bovenaan', () => {
    const deals: PipelineDeal[] = [
      { id: 'a', stage: 'identified', execution_state: 'matched', updated_at: '2026-09-01T00:00:00Z' },
      { id: 'b', stage: 'identified', execution_state: 'matched', updated_at: '2026-09-10T00:00:00Z' },
      { id: 'c', stage: 'lost', execution_state: 'matched' },
    ];
    const g = groepeerPipeline(deals);
    expect(g.gematcht.map(d => d.id)).toEqual(['b', 'a']);
    expect(Object.values(g).flat()).toHaveLength(2);
  });
});

describe('volumeSom', () => {
  it('telt ingevulde volumes, ook als tekst, en geeft null als er geen is', () => {
    expect(volumeSom([{ volume_mt: '600' }, { volume_mt: 400 }, { volume_mt: null }])).toBe(1000);
    expect(volumeSom([{ volume_mt: null }, {}])).toBeNull();
  });
});

describe('past en tel', () => {
  it('zoekt hoofdletterongevoelig in de gegeven velden', () => {
    expect(past('zam', 'Mopani', 'Zambia')).toBe(true);
    expect(past('', null)).toBe(true);
    expect(past('chile', 'Zambia')).toBe(false);
  });

  it('telt per sleutel, grootste eerst, leeg als (unknown)', () => {
    expect(tel([{ l: 'NL' }, { l: 'DE' }, { l: 'NL' }, { l: '' }], x => x.l)).toEqual([
      { sleutel: 'NL', aantal: 2 }, { sleutel: '(unknown)', aantal: 1 }, { sleutel: 'DE', aantal: 1 },
    ]);
  });
});

describe('filterBedrijven', () => {
  const bedrijven: Bedrijf[] = [
    { id: '1', naam: 'Mopani Copper', soort: 'supplier', verificatie: 'reviewing', land: 'Zambia', commodities: ['Copper'] },
    { id: '2', naam: 'KME', soort: 'buyer', verificatie: 'unverified', land: 'Italy' },
  ];

  it('combineert soort, verificatie en zoeken', () => {
    expect(filterBedrijven(bedrijven, { zoek: '', soort: 'supplier', verificatie: 'alle' }).map(b => b.id)).toEqual(['1']);
    expect(filterBedrijven(bedrijven, { zoek: 'copper', soort: 'alle', verificatie: 'alle' }).map(b => b.id)).toEqual(['1']);
    expect(filterBedrijven(bedrijven, { zoek: '', soort: 'alle', verificatie: 'unverified' }).map(b => b.id)).toEqual(['2']);
  });
});

describe('berichten', () => {
  const berichten: Bericht[] = [
    { id: 'in', richting: 'inbound', kanaal: 'email', onderwerp: 'Copper CIF', intelligentie: { akkoord_nodig: true, status: 'new' } },
    { id: 'uit', richting: 'outbound', kanaal: 'email', onderwerp: 'Qualification', concepten: [{ id: 'c', akkoord: 'pending' }] },
    { id: 'bel', richting: 'inbound', kanaal: 'phone', onderwerp: 'Call' },
    { id: 'int', richting: 'internal', kanaal: 'other', onderwerp: 'Note' },
  ];

  it('vraagtActie ziet een wachtend concept of intelligentie die om akkoord vraagt', () => {
    expect(vraagtActie(berichten[0])).toBe(true);
    expect(vraagtActie(berichten[1])).toBe(true);
    expect(vraagtActie(berichten[2])).toBe(false);
    expect(vraagtActie({ id: 'x', richting: 'inbound', intelligentie: { akkoord_nodig: true, status: 'handled' } })).toBe(false);
  });

  it('filtert op kanaal, richting en actie', () => {
    expect(filterBerichten(berichten, 'email', '').map(b => b.id)).toEqual(['in', 'uit']);
    expect(filterBerichten(berichten, 'telefoon', '').map(b => b.id)).toEqual(['bel']);
    expect(filterBerichten(berichten, 'intern', '').map(b => b.id)).toEqual(['int']);
    expect(filterBerichten(berichten, 'actie', '').map(b => b.id)).toEqual(['in', 'uit']);
    expect(filterBerichten(berichten, 'alle', 'cif').map(b => b.id)).toEqual(['in']);
  });
});

describe('alsLijst', () => {
  it('maakt van jsonb-arrays, objecten en tekst leesbare regels', () => {
    expect(alsLijst(['LC terms', '', 'mandate'])).toEqual(['LC terms', 'mandate']);
    expect(alsLijst('Only one')).toEqual(['Only one']);
    expect(alsLijst({ price: 'missing' })).toEqual(['price: missing']);
    expect(alsLijst(null)).toEqual([]);
  });
});
