/**
 * Eén AXE-bericht dat groeit terwijl tokens binnenkomen.
 * Zonder dit pad werd het bericht pas ná de complete LLM-response (en vaak
 * ná de eerste TTS-chunk) in de store gezet — dan is first-token onmogelijk.
 */
export interface AxeStreamSlot {
  provider: string;
  model?: string;
}

interface ChatBeurtRegel {
  role: string;
  text?: string;
  timestamp: number;
  provider?: string;
  model?: string;
}

export function volgendeAxeBericht(
  conversation: ChatBeurtRegel[],
  partial: string,
  slot: AxeStreamSlot,
  axeTs: number,
): ChatBeurtRegel[] {
  const msg: ChatBeurtRegel = {
    role: 'axe',
    text: partial,
    timestamp: axeTs,
    provider: slot.provider,
    model: slot.model,
  };
  const i = conversation.findIndex(m => m.role === 'axe' && m.timestamp === axeTs);
  if (i >= 0) {
    const next = conversation.slice();
    next[i] = msg;
    return next;
  }
  return [...conversation, msg];
}
