import { describe, expect, it } from 'vitest';
import {
  formatteerFout,
  formatteerOnderzoek,
  leesAgentAntwoord,
  leesPerplexityFout,
  leesPerplexityStand,
} from '@/domain/perplexityAgent';

/**
 * De vorm uit de API-referentie van POST /v1/agent. Let op wat er NIET in staat:
 * geen `output_text` op het hoogste niveau. Dat veld maakt de SDK zelf; via REST
 * bestaat het niet. De eerste test hieronder is precies om die reden.
 */
const ANTWOORD = {
  id: 'resp_1',
  object: 'response',
  status: 'completed',
  model: 'openai/gpt-5.6-luna',
  output: [
    {
      type: 'search_results',
      queries: ['goud deze week'],
      results: [
        { id: 1, url: 'https://a.example/goud', title: 'Goud stijgt', snippet: '…', source: 'web' },
        { id: 2, url: 'https://b.example/dollar', title: 'Dollar zwakker', snippet: '…', source: 'web' },
      ],
    },
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Goud steeg door een zwakkere dollar.',
          annotations: [{ type: 'url_citation', start_index: 0, end_index: 4, url: 'https://b.example/dollar', title: 'Dollar zwakker' }],
        },
        { type: 'output_text', text: 'De Fed blijft voorzichtig.', annotations: [] },
      ],
    },
  ],
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, cost: { currency: 'USD', total_cost: 0.0153 } },
};

describe('een antwoord van de Agent API lezen', () => {
  it('haalt de tekst uit output[], want REST heeft geen output_text', () => {
    const o = leesAgentAntwoord(ANTWOORD);
    expect(o.answer).toBe('Goud steeg door een zwakkere dollar.\n\nDe Fed blijft voorzichtig.');
  });

  it('zet aangehaalde bronnen vóór alleen gevonden bronnen', () => {
    const { sources } = leesAgentAntwoord(ANTWOORD);
    expect(sources.map(s => s.url)).toEqual(['https://b.example/dollar', 'https://a.example/goud']);
    expect(sources[0].aangehaald).toBe(true);
    expect(sources[1].aangehaald).toBe(false);
  });

  it('telt een bron die gevonden én aangehaald is maar één keer', () => {
    expect(leesAgentAntwoord(ANTWOORD).sources).toHaveLength(2);
  });

  it('leest wat Perplexity zelf rekende', () => {
    expect(leesAgentAntwoord(ANTWOORD).costUsd).toBe(0.0153);
    expect(leesAgentAntwoord(ANTWOORD).model).toBe('openai/gpt-5.6-luna');
  });

  it('valt niet om op een leeg of vreemd antwoord', () => {
    for (const vreemd of [null, undefined, 'tekst', [], {}, { output: 'geen lijst' }, { usage: { cost: null } }]) {
      const o = leesAgentAntwoord(vreemd);
      expect(o.answer).toBe('');
      expect(o.sources).toEqual([]);
      expect(o.costUsd).toBe(0);
    }
  });

  it('meldt een leeg antwoord als leeg, niet als "niets gevonden" met bronnen', () => {
    expect(formatteerOnderzoek(leesAgentAntwoord({}), 'goud')).toContain('no answer');
  });

  it('geeft antwoord en bronnen door aan het volgende model', () => {
    const tekst = formatteerOnderzoek(leesAgentAntwoord(ANTWOORD), 'Wat drijft goud?');
    expect(tekst).toContain('Goud steeg door een zwakkere dollar.');
    expect(tekst).toContain('https://b.example/dollar');
  });
});

/**
 * De vorm zoals Perplexity hem ECHT stuurde, gemeten op 14 september 2026 met
 * preset `low` -- en die wijkt op twee punten af van de API-referentie hierboven.
 * Titels en URLs zijn vervangen; de structuur en veldnamen zijn letterlijk.
 */
const ECHTE_VORM = {
  object: 'response',
  status: 'completed',
  model: 'openai/gpt-5.6-luna',
  output: [
    {
      type: 'search_results',
      queries: ['gold price this week'],
      results: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1, url: `https://bron${i + 1}.example`, title: `Bron ${i + 1}`,
        snippet: '…', source: 'web', date: '2026-09-12', last_updated: '2026-09-12',
      })),
    },
    // `contents`, niet `results` -- de referentie noemt alleen `results`.
    { type: 'fetch_url_results', contents: [{ url: 'https://geopend.example', title: 'Geopende pagina', snippet: '…' }] },
    {
      type: 'message', id: 'msg_1', role: 'assistant', status: 'completed',
      content: [{
        type: 'output_text',
        text: 'Gold fell about 1.5% this week. [web:1] Friday saw a rebound. [web:1][web:13]',
        annotations: [], // nul url_citations, ook met "cite sources" in de vraag
      }],
    },
  ],
  usage: { cost: { currency: 'USD', total_cost: 0.0049 } },
};

describe('de vorm die Perplexity echt stuurt', () => {
  it('maakt een bron aangehaald via [web:N] in de tekst, niet alleen via annotaties', () => {
    const { sources } = leesAgentAntwoord(ECHTE_VORM);
    const aangehaald = sources.filter(s => s.aangehaald).map(s => s.id);
    expect(aangehaald).toEqual([1, 13]);
    // en die staan vooraan
    expect(sources.slice(0, 2).map(s => s.id)).toEqual([1, 13]);
  });

  it('leest de geopende pagina uit `contents`', () => {
    // Met alleen `results` gelezen kwam deze bron stilletjes nooit mee.
    expect(leesAgentAntwoord(ECHTE_VORM).sources.map(s => s.url)).toContain('https://geopend.example');
  });

  it('zet het nummer bij de bron, zodat [web:13] te volgen is', () => {
    const tekst = formatteerOnderzoek(leesAgentAntwoord(ECHTE_VORM), 'goud');
    expect(tekst).toContain('[web:13] Bron 13 — https://bron13.example');
    expect(tekst).toContain('[web:1] Bron 1 — https://bron1.example');
  });

  it('noemt een verwijzing naar een onbekend id geen bron', () => {
    const anders = structuredClone(ECHTE_VORM);
    (anders.output[2] as { content: Array<{ text: string }> }).content[0].text = 'Iets. [web:99]';
    expect(leesAgentAntwoord(anders).sources.some(s => s.aangehaald)).toBe(false);
  });
});

describe('waarom een vraag niet doorging', () => {
  it('onderscheidt het eigen dagbudget van Perplexity-tegoed', () => {
    // Allebei 402, andere oplossing: wachten tot middernacht versus bijladen.
    expect(leesPerplexityFout(402, 'Daily Perplexity budget of $1.00 is spent. Resets at 00:00 UTC.').reden).toBe('dagbudget-op');
    expect(leesPerplexityFout(402, 'Insufficient credits').reden).toBe('tegoed-op');
  });

  it('neemt de wachttijd mee bij overbelasting', () => {
    const f = leesPerplexityFout(429, 'model overloaded', '7');
    expect(f.reden).toBe('overbelast');
    expect(f.retryAfterSec).toBe(7);
    expect(leesPerplexityFout(429, 'x', 'Wed, 21 Oct 2026 07:28:00 GMT').retryAfterSec).toBeUndefined();
  });

  it('herkent een niet ingestelde server en een geweigerde sleutel', () => {
    expect(leesPerplexityFout(503, 'Perplexity not configured (set PERPLEXITY_API_KEY on the server).').reden).toBe('niet-ingesteld');
    expect(leesPerplexityFout(502, 'Perplexity rejected the server key (401). Rotate PERPLEXITY_API_KEY in the console.').reden).toBe('sleutel-geweigerd');
  });

  it('leest een 404 als een route die nog niet gedeployd is, niet als een mislukte vraag', () => {
    // De app kan eerder gebouwd zijn dan de VPS bijgewerkt is. Dan moet AXE
    // naar de server wijzen, niet naar Perplexity.
    const f = leesPerplexityFout(404, 'Not Found');
    expect(f.reden).toBe('niet-ingesteld');
    expect(formatteerFout(f)).toMatch(/not deployed/);
  });

  it('laat een budgetstop nooit lezen als een leeg zoekresultaat', () => {
    const zin = formatteerFout(leesPerplexityFout(402, 'Daily Perplexity budget of $1.00 is spent.'));
    expect(zin).toMatch(/budget stop, not an empty result/);
  });
});

describe('of de server-sleutel er is, zonder een vraag te stellen', () => {
  it('gelooft GET { configured: true } en weigert configured: false', () => {
    expect(leesPerplexityStand(200, '', { configured: true }).ok).toBe(true);
    expect(leesPerplexityStand(200, '', { configured: false }).ok).toBe(false);
  });

  it('leest POST zonder vraag als bewijs dat de sleutel er is', () => {
    // 400 Missing question komt ná de sleutelcheck. 503 ervoor.
    expect(leesPerplexityStand(400, 'Missing question').ok).toBe(true);
    expect(leesPerplexityStand(503, 'Perplexity not configured (set PERPLEXITY_API_KEY on the server).').ok).toBe(false);
  });

  it('kent 405 als "probeer POST" en 404 als nog niet gedeployd', () => {
    expect(leesPerplexityStand(405, 'Method Not Allowed').error).toBe('GET-niet-ondersteund');
    expect(leesPerplexityStand(404, 'Not Found').ok).toBe(false);
  });
});
