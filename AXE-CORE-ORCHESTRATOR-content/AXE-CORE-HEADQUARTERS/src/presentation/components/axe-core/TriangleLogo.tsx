interface TriangleLogoProps {
  size?: number;
  animate?: boolean;
  id?: string;
}

export function TriangleLogo({ size = 64, animate = false, id = 'tl' }: TriangleLogoProps) {
  const gradId = `axe-grad-${id}`;
  const glowId = `axe-glow-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="AXE CORE"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow layer */}
      <g filter={`url(#${glowId})`}>
        <path d="M32 6 L58 56 L6 56 Z" fill={`url(#${gradId})`} />
      </g>

      {/* Inner detail lines */}
      <line x1="32" y1="18" x2="32" y2="42" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeLinecap="round" />
      <circle cx="32" cy="47" r="1.2" fill="rgba(255,255,255,0.35)" />

      {/* Animated outer pulse */}
      {animate && (
        <path d="M32 6 L58 56 L6 56 Z" stroke="#00D4FF" strokeWidth="1" fill="none" opacity="0.4">
          <animate attributeName="opacity" values="0.15;0.6;0.15" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="0.5;1.5;0.5" dur="2.4s" repeatCount="indefinite" />
        </path>
      )}
    </svg>
  );
}
