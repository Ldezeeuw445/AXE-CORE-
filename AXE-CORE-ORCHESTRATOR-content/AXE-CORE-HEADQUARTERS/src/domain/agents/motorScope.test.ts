import { describe, it, expect } from 'vitest';
import { keuzesVoorAgent, slotsVoorAgent, kiestAbonnement, SCOPE_TEKST } from './motorScope';
import { NOOIT_AXE_BREIN } from '@/domain/providers';
import { AXE_AGENTS, agentsByTier } from './roster';
import { STANDAARD_TOEWIJZING } from '@/domain/agentMotoren';
import { PROVIDERS } from '@/domain/providers';

const ALLE_PROVIDERS = PROVIDERS.map((p) => p.id);

/** Sleutels voor alles wat een sleutel kán hebben, zodat de lijst niet leeg is
 *  om de verkeerde reden. */
const VERBINDINGEN: Record<string, { key: string }> = Object.fromEntries(
  ALLE_PROVIDERS.map((id) => [id, { key: 'sleutel-voor-de-test' }]),
);

const slot = (provider: string, model?: string) => ({ provider, model, key: 'k' });

const SLOTS = [
  slot('abonnement', 'codex'),
  slot('ollama', 'qwen2.5'),
  slot('google', 'gemini-2.0-flash'),
  slot('anthropic', 'claude-sonnet-5'),
  slot('openai', 'gpt-4o-mini'),
  slot('groq', 'llama-3.1-8b-instant'),
];

describe('keuzesVoorAgent volgt de scope uit roster.ts', () => {
  it('AXE krijgt snelle/slimme modellen, nooit een abonnement of Ollama', () => {
    const keuzes = keuzesVoorAgent('axe', VERBINDINGEN, ALLE_PROVIDERS) ?? [];
    expect(keuzes.length).toBeGreaterThan(0);
    for (const k of keuzes) expect(NOOIT_AXE_BREIN).not.toContain(k.provider);
  });

  it('een tier-2 worker krijgt hetzelfde plus Ollama vooraan', () => {
    const keuzes = keuzesVoorAgent('cron', VERBINDINGEN, ALLE_PROVIDERS) ?? [];
    expect(keuzes[0]?.provider).toBe('ollama');
    expect(keuzes.some((k) => k.provider === 'abonnement')).toBe(false);
  });

  it('een tier-3 app-agent krijgt alleen betaalde Anthropic/OpenAI', () => {
    const keuzes = keuzesVoorAgent('intel', VERBINDINGEN, ALLE_PROVIDERS) ?? [];
    expect(keuzes.length).toBeGreaterThan(0);
    for (const k of keuzes) expect(['anthropic', 'openai']).toContain(k.provider);
  });

  // Een manager kiest geen model maar een abonnement. Dat is een andere lijst,
  // uit agentMotoren.ts -- null zegt dat, in plaats van een modellenlijst te
  // geven die daar niet hoort.
  it('een tier-1 manager krijgt geen modellenlijst, maar de abonnementenrij', () => {
    for (const a of agentsByTier('tier1')) {
      expect(keuzesVoorAgent(a, VERBINDINGEN, ALLE_PROVIDERS)).toBeNull();
      expect(kiestAbonnement(a)).toBe(true);
    }
    expect(kiestAbonnement('axe')).toBe(false);
    expect(kiestAbonnement('cron')).toBe(false);
  });

  /* Dit is de test die de belofte bewaakt: komt er een agent bij in de roster,
     dan moet hij vanzelf een kiezer krijgen. Zonder dit kon een nieuwe agent
     stilletjes zonder menu landen -- precies wat er met dropdownScope gebeurde
     toen niemand het veld las. */
  it('elke agent in de roster krijgt een kiezer die bij zijn scope past', () => {
    for (const a of AXE_AGENTS) {
      const keuzes = keuzesVoorAgent(a, VERBINDINGEN, ALLE_PROVIDERS);
      if (kiestAbonnement(a)) expect(keuzes, a.id).toBeNull();
      else expect(keuzes?.length, a.id).toBeGreaterThan(0);
      expect(SCOPE_TEKST[a.dropdownScope], a.id).toBeTruthy();
    }
  });
});

describe('slotsVoorAgent bepaalt wie er werkelijk mag antwoorden', () => {
  it('AXE: geen abonnement, geen Ollama, de rest in volgorde', () => {
    const uit = slotsVoorAgent('axe', SLOTS).map((s) => s.provider);
    expect(uit).toEqual(['google', 'anthropic', 'openai', 'groq']);
  });

  it('tier 2: Ollama blijft, het abonnement gaat eruit', () => {
    const uit = slotsVoorAgent('cron', SLOTS).map((s) => s.provider);
    expect(uit).toContain('ollama');
    expect(uit).not.toContain('abonnement');
  });

  it('tier 3: alleen anthropic en openai', () => {
    expect(slotsVoorAgent('intel', SLOTS).map((s) => s.provider)).toEqual(['anthropic', 'openai']);
  });

  it('tier 1: zijn eigen abonnement vooraan, daarna alleen sleutels', () => {
    // In de standaardtoewijzing draait Trading op codex.
    const uit = slotsVoorAgent('trading', SLOTS, STANDAARD_TOEWIJZING);
    expect(uit[0]).toMatchObject({ provider: 'abonnement', model: 'codex' });
    // Geen tweede abonnement erachter: dat zou het abonnement van een ander zijn.
    expect(uit.slice(1).some((s) => s.provider === 'abonnement')).toBe(false);
  });

  it('tier 1 zonder toewijzing draait op sleutels, niet op een geraden abonnement', () => {
    const uit = slotsVoorAgent('wingman', SLOTS);
    expect(uit.some((s) => s.provider === 'abonnement')).toBe(false);
  });

  it('een lege slotlijst blijft leeg in plaats van te klappen', () => {
    for (const a of AXE_AGENTS) {
      expect(slotsVoorAgent(a, [], STANDAARD_TOEWIJZING).length, a.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('de regel staat nog maar op één plek', () => {
  it('NOOIT_AXE_BREIN noemt het abonnement en Ollama', () => {
    expect([...NOOIT_AXE_BREIN].sort()).toEqual(['abonnement', 'ollama']);
  });

  it('en wat AXE niet mag, mag een tier-2 worker wel behalve het abonnement', () => {
    const axe = slotsVoorAgent('axe', SLOTS).map((s) => s.provider);
    const worker = slotsVoorAgent('browser', SLOTS).map((s) => s.provider);
    expect(worker.filter((p) => !axe.includes(p))).toEqual(['ollama']);
  });
});
