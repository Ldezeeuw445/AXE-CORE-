/**
 * Het driehoekje van AXE, maar dan als gezicht: ronde hoeken, twee ogen, en
 * gevuld met de accentkleur van die manager uit roster.ts. Zo herken je op één
 * blik wie er praat, ook op 20 pixels. Sinds 19 nov tonen de ogen ook wat hij
 * doet (zie AxeGezicht.tsx), en staat hetzelfde driehoekje in de notch.
 */
import type { AxeAgent } from '@/domain/agents/roster';
import { AxeGezicht, type Stemming } from './AxeGezicht';

export function ManagerAvatar({
  agent,
  size = 26,
  stemming = 'rust',
}: {
  agent: AxeAgent;
  size?: number;
  stemming?: Stemming;
}) {
  return <AxeGezicht kleur={agent.accent} stemming={stemming} size={size} label={agent.name} />;
}
