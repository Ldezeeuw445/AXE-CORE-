import { describe, it, expect } from 'vitest';
import { buildCallLlmFromSlots } from '@/application/tradingIntel/runTradingResearch';
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
