/**
 * Het gezicht van een manager (18 nov 2026: Luka wilde de avatars "zoals de
 * voorbeeldfoto's, maar AXE-stijl"). Was een driehoekje met ogen; nu het
 * AXE-gezicht uit AxeGezicht.tsx, in de accentkleur uit roster.ts. AXE Core
 * zelf is wit, zoals de bol in de notch -- zo is het overal dezelfde AXE.
 */
import type { AxeAgent } from '@/domain/agents/roster';
import { AXE_WIT, AxeGezicht, type Stemming } from './AxeGezicht';

export function ManagerAvatar({
  agent,
  size = 26,
  stemming = 'rust',
}: {
  agent: AxeAgent;
  size?: number;
  stemming?: Stemming;
}) {
  return (
    <AxeGezicht
      kleur={agent.id === 'axe' ? AXE_WIT : agent.accent}
      stemming={stemming}
      size={size}
      label={agent.name}
    />
  );
}
