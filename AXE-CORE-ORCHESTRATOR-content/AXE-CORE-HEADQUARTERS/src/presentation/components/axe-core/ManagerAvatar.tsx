/**
 * Het driehoekje van AXE, maar dan als gezicht: ronde hoeken, twee ogen, en
 * gevuld met de accentkleur van die manager uit roster.ts. Zo herken je op één
 * blik wie er praat, ook op 20 pixels.
 *
 * De vorm komt van TriangleLogo.tsx (M32 6 L58 56 L6 56 Z), maar met ronde
 * hoeken: het scherpe logo is het merk, dit is een portret.
 */
import type { AxeAgent } from '@/domain/agents/roster';

/** Driehoek met ronde hoeken, in hetzelfde 64×64-vak als TriangleLogo. */
const DRIEHOEK =
  'M32 7.5c2.3 0 4.4 1.25 5.5 3.3l20.2 35.8c2.2 3.9-.6 8.7-5.1 8.7H11.4' +
  'c-4.5 0-7.3-4.8-5.1-8.7L26.5 10.8A6.3 6.3 0 0 1 32 7.5z';

export function ManagerAvatar({
  agent,
  size = 26,
}: {
  agent: AxeAgent;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={agent.name}
      style={{
        flexShrink: 0,
        display: 'block',
        // Zelfde reden als de tekstschaduw in de kolom: in de glasstand staat
        // dit driehoekje zo op een lichte bureaubladfoto.
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
      }}
    >
      <path d={DRIEHOEK} fill={agent.accent} />
      {/* De ogen. Donker, want elk accent uit de roster is licht genoeg. */}
      <rect x="25.4" y="34" width="4.6" height="10.5" rx="2.3" fill="#101319" />
      <rect x="34" y="34" width="4.6" height="10.5" rx="2.3" fill="#101319" />
    </svg>
  );
}
