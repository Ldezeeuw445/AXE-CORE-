/**
 * Zet een klaar job-resultaat in de chat zonder voiceStatus te stelen.
 * De gebruiker kan blijven praten; TTS volgt de spraakrij.
 */
interface ChatRegel {
  role: 'user' | 'axe';
  text: string;
  timestamp: number;
  provider?: string;
  model?: string;
}

export function injecteerJobResultaat(
  conversation: ChatRegel[],
  tekst: string,
  nu = Date.now(),
): ChatRegel[] {
  const visible = (tekst || '').trim();
  if (!visible) return conversation;
  return [
    ...conversation,
    {
      role: 'axe',
      text: visible,
      timestamp: nu,
      provider: 'tier3',
      model: 'job',
    },
  ];
}

export function chatBlijftLuisteren(status: string): boolean {
  return status === 'listening';
}
