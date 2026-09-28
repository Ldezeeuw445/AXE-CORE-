/**
 * Zet een klaar job-resultaat in de chat zonder voiceStatus te stelen.
 * De gebruiker kan blijven praten; TTS volgt de spraakrij.
 */
import type { AxeAgentId } from '@/domain/agents/roster';

interface ChatRegel {
  role: 'user' | 'axe';
  text: string;
  timestamp: number;
  provider?: string;
  model?: string;
  delegate?: AxeAgentId;
}

interface JobChatMeta {
  model?: string;
  delegate?: AxeAgentId;
}

export function injecteerJobResultaat(
  conversation: ChatRegel[],
  tekst: string,
  nu = Date.now(),
  meta: JobChatMeta = {},
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
      model: meta.model ?? 'job',
      delegate: meta.delegate,
    },
  ];
}

export function chatBlijftLuisteren(status: string): boolean {
  return status === 'listening';
}
