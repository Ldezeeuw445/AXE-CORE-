import { describe, it, expect } from 'vitest';
import {
  classifyAxeTier,
  parseModelKlassificatie,
  groetAntwoord,
  statusAntwoord,
  takenAntwoord,
  agendaAntwoord,
  prioriteitenAntwoord,
  tier3Ack,
  capabilityVoorAgent,
  type AxeRouteTier,
} from './axeRoute';

/** Tabel van beurten die de classifier zonder model moet raken. */
const VOORBEELDEN: Array<{ text: string; tier: AxeRouteTier; note?: string }> = [
  // Tier 1 — NL + EN
  { text: 'hey axe', tier: 1 },
  { text: 'heyaxe', tier: 1 },
  { text: 'hey axe!', tier: 1 },
  { text: 'hoi', tier: 1 },
  { text: 'hallo axe', tier: 1 },
  { text: 'hi', tier: 1 },
  { text: 'good morning', tier: 1 },
  { text: 'goedemorgen', tier: 1 },
  { text: 'ben je daar', tier: 1 },
  { text: 'you there', tier: 1 },
  { text: 'how are you', tier: 1 },
  { text: 'hoe gaat het', tier: 1 },
  { text: "what's your status", tier: 1 },
  { text: 'hoe staat het systeem', tier: 1 },
  { text: 'what are my priorities', tier: 1 },
  { text: 'wat zijn mijn prioriteiten', tier: 1 },
  { text: 'what are my tasks', tier: 1 },
  { text: 'wat zijn mijn taken', tier: 1 },
  { text: "what's on my calendar", tier: 1 },
  { text: 'wat staat er op mijn agenda', tier: 1 },
  { text: 'wat moet ik vandaag doen', tier: 1 },
  { text: 'wat heb je gedaan', tier: 1 },
  { text: 'Wat heb je gedaan?', tier: 1 },
  { text: 'status', tier: 1 },
  { text: 'what have you done', tier: 1 },
  { text: 'check NorthSea deals', tier: 3 },

  // Tier 2 — NL + EN
  { text: "summarize today's AI news", tier: 2 },
  { text: 'vat het AI-nieuws van vandaag samen', tier: 2 },
  { text: 'explain how RAG works', tier: 2 },
  { text: 'leg uit hoe embeddings werken', tier: 2 },
  { text: "what's the weather", tier: 2 },
  { text: 'wat is het weer', tier: 2 },
  { text: 'what is bitcoin', tier: 2 },
  { text: 'wat is een moving average', tier: 2 },
  { text: 'hey axe, wat is de bitcoin koers', tier: 2 },

  // Tier 3 — NL + EN
  { text: 'research the copper market and write a report', tier: 3 },
  { text: 'doe diep research naar goud', tier: 3 },
  { text: 'open a long on XAUUSD', tier: 3 },
  { text: 'zet een short op EURUSD', tier: 3 },
  { text: 'fix the login bug', tier: 3 },
  { text: 'los de login-bug op', tier: 3 },
  { text: 'run the wingman crew', tier: 3 },
  { text: 'start de crew', tier: 3 },
  { text: 'check the northsea deals', tier: 3 },
  { text: 'bekijk de northsea deals', tier: 3 },
  { text: 'browse https://example.com and summarise it', tier: 3 },
  { text: 'plan today', tier: 3 },
  { text: 'inbox brief', tier: 3 },
  { text: 'intel brief', tier: 3 },
  { text: 'weekly review', tier: 3 },
  { text: 'hey axe, fix the login bug', tier: 3 },
];

describe('classifyAxeTier', () => {
  it.each(VOORBEELDEN)('"$text" → tier $tier', ({ text, tier }) => {
    const route = classifyAxeTier(text);
    expect(route.tier, `${text} werd ${route.tier} (${route.reason})`).toBe(tier);
    expect(route.confident).toBe(true);
    expect(route.via).toBe('rules');
  });

  it('kiest de juiste agent bij een duidelijk domein', () => {
    expect(classifyAxeTier('open a long on XAUUSD').agent).toBe('trading');
    expect(classifyAxeTier('check the northsea deals').agent).toBe('northsea');
    expect(classifyAxeTier('fix the login bug').agent).toBe('developer');
    expect(classifyAxeTier('run the wingman crew').agent).toBe('wingman');
    expect(classifyAxeTier('intel brief').agent).toBe('intel');
  });

  it('sessie-status is tier 1 uit de job-store, geen groot model', () => {
    expect(classifyAxeTier('wat heb je gedaan').kind).toBe('session');
    expect(classifyAxeTier('status').kind).toBe('session');
    expect(classifyAxeTier('what have you done').kind).toBe('session');
  });

  it('houdt begroetingen uit de grote-model-route', () => {
    const r = classifyAxeTier('hey axe');
    expect(r.tier).toBe(1);
    expect(r.kind).toBe('greeting');
    expect(r.agent).toBe('axe');
  });

  it('blijft onder 5 ms voor de hele tabel (regels, geen I/O)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i += 1) {
      for (const { text } of VOORBEELDEN) classifyAxeTier(text);
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
  });
});

describe('parseModelKlassificatie', () => {
  it('leest geldig JSON', () => {
    const r = parseModelKlassificatie('{"tier":2,"agent":"axe"}');
    expect(r?.tier).toBe(2);
    expect(r?.via).toBe('model');
  });

  it('negeert rommel en ongeldige tiers', () => {
    expect(parseModelKlassificatie('niet json')).toBeNull();
    expect(parseModelKlassificatie('{"tier":9}')).toBeNull();
    expect(parseModelKlassificatie('prefix {"tier":3,"agent":"trading"} suffix')?.agent).toBe('trading');
  });
});

describe('tier-antwoorden (geen model)', () => {
  it('groet zonder LLM', () => {
    expect(groetAntwoord(new Date('2026-09-24T08:00:00'))).toMatch(/Morning/);
    expect(groetAntwoord(new Date('2026-09-24T15:00:00'))).toMatch(/Hey/);
  });

  it('zet status en taken uit opgeslagen data', () => {
    expect(statusAntwoord({ vpsOnline: true, openTasks: 2, overdueTasks: 1 }))
      .toMatch(/VPS up/);
    expect(takenAntwoord(['Call buyer', 'Review risk'], 1)).toMatch(/Call buyer/);
    expect(agendaAntwoord([])).toMatch(/Nothing on the calendar/);
    expect(prioriteitenAntwoord(['Ship offer'], 0, ['Stand-up'])).toMatch(/Stand-up/);
    expect(tier3Ack('Trading Agent', null)).toMatch(/Trading Agent/);
    expect(capabilityVoorAgent('developer')).toBe('code');
    expect(capabilityVoorAgent('trading')).toBe('trading');
  });
});
