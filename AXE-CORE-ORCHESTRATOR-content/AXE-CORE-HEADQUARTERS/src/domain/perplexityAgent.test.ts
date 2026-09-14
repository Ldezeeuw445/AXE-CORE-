import { describe, expect, it } from 'vitest';
import {
  formatteerFout,
  formatteerOnderzoek,
  leesAgentAntwoord,
  leesPerplexityFout,
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
