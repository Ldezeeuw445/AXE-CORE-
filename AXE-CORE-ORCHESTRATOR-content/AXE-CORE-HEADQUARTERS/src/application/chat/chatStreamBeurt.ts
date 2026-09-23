/**
 * Eén AXE-bericht dat groeit terwijl tokens binnenkomen.
 * Zonder dit pad werd het bericht pas ná de complete LLM-response (en vaak
 * ná de eerste TTS-chunk) in de store gezet — dan is first-token onmogelijk.
 */
export interface AxeStreamSlot {
  provider: string;
  model?: string;
}

export interface AxeStreamBericht {
  role: 'axe';
  text: string;
  timestamp: number;
  provider?: string;
  model?: string;
}

export function volgendeAxeBericht<T extends { role: string; timestamp: number }>(
  conversation: T[],
  partial: string,
  slot: AxeStreamSlot,
  axeTs: number,
): Array<T | AxeStreamBericht> {
  const msg: AxeStreamBericht = {
    role: 'axe',
    text: partial,
    timestamp: axeTs,
    provider: slot.provider,
    model: slot.model,
  };
  const i = conversation.findIndex(m => m.role === 'axe' && m.timestamp === axeTs);
  if (i >= 0) {
    const next = conversation.slice();
    next[i] = msg as T;
    return next;
  }
  return [...conversation, msg];
}
