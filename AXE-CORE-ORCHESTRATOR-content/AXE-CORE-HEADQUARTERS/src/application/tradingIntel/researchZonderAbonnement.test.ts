import { describe, it, expect } from 'vitest';
import { buildCallLlmFromSlots, buildBeslissingCallLlm } from '@/application/tradingIntel/runTradingResearch';
import type { KeySlot } from '@/domain/providers';

// Het knooppunt waar elke rol van de research-desk doorheen gaat: autopilot,
// de Research-knop en de desk-lanes. Zolang deze test staat, kan geen nieuwe
// ingang met een eigen cascade de desk weer op een abonnement zetten.
describe('research-desk en abonnement', () => {
  it('slaat een abonnement-slot over, ook als die bovenaan staat', async () => {
    const aangeroepen: string[] = [];
    const callLlm = buildCallLlmFromSlots(
      [{ provider: 'abonnement', model: 'codex' }, { provider: 'ollama', model: 'qwen3.5:2b' }] as KeySlot[],
      async (slot) => { aangeroepen.push(slot.provider); return 'ok'; },
    );
    expect(await callLlm!('systeem', 'vraag')).toBe('ok');
    expect(aangeroepen).toEqual(['ollama']);
  });

  it('geeft niets terug als er alleen een abonnement is', () => {
    const callLlm = buildCallLlmFromSlots(
      [{ provider: 'abonnement', model: 'codex' }] as KeySlot[],
      async () => 'mag nooit gebeuren',
    );
    expect(callLlm).toBeUndefined();
  });
});

describe('de eindbeslissing van AXE Algo', () => {
  it('gebruikt het abonnement van AXE Algo, en valt terug op sleutels als dat faalt', async () => {
    const aangeroepen: string[] = [];
    const beslis = buildBeslissingCallLlm(
      [{ provider: 'abonnement', model: 'claude' }, { provider: 'groq', model: 'llama' }] as KeySlot[],
      'codex',
      async (slot) => {
        aangeroepen.push(`${slot.provider}:${slot.model}`);
        if (slot.provider === 'abonnement') throw new Error('usage limit');
        return 'HOLD';
      },
    );
    expect(await beslis!('s', 'u')).toBe('HOLD');
    // Eigen abonnement eerst, het abonnement van een ander (claude) nooit.
    expect(aangeroepen).toEqual(['abonnement:codex', 'groq:llama']);
  });

  it('draait zonder toegewezen abonnement op de sleutels', async () => {
    const aangeroepen: string[] = [];
    const beslis = buildBeslissingCallLlm(
      [{ provider: 'ollama', model: 'qwen3.5:2b' }] as KeySlot[], null,
      async (slot) => { aangeroepen.push(slot.provider); return 'ok'; },
    );
    await beslis!('s', 'u');
    expect(aangeroepen).toEqual(['ollama']);
  });
});
