/** AXE Core own notch mascot — animated in code (not Mochi artwork).
 * Soft glossy charcoal blob with cyan→violet AXE branding (TriangleLogo palette).
 */
export type MascotState = "idle" | "thinking" | "working" | "done" | "offline";

type Props = {
  state?: MascotState;
  size?: number;
  showBubble?: boolean;
};

export function AxeMascot({ state = "idle", size = 36, showBubble = true }: Props) {
  const gid = "axe-blob-g";
  const glow = "axe-blob-glow";
  return (
    <span className={`axe-mascot state-${state}`} style={{ width: size, height: size }} aria-hidden>
      {showBubble && (state === "thinking" || state === "working") && (
        <span className={`status-bubble ${state}`}>
          <i /><i /><i />
        </span>
      )}
      <svg viewBox="0 0 64 64" width={size} height={size} className="blob-svg">
        <defs>
          <linearGradient id={gid} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E8FBFF" />
            <stop offset="35%" stopColor="#7DD3FC" />
            <stop offset="70%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <radialGradient id={`${gid}-shine`} cx="32%" cy="28%" r="55%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* soft ground shadow */}
        <ellipse cx="32" cy="56" rx="16" ry="3.2" fill="rgba(0,0,0,0.28)" className="blob-shadow" />
        <g filter={`url(#${glow})`} className="blob-body">
          {/* capsule / soft triangle hybrid — AXE silhouette */}
          <path
            className="blob-shape"
            d="M32 6
               C44 6 54 16 54 30
               C54 42 46 52 32 58
               C18 52 10 42 10 30
               C10 16 20 6 32 6 Z"
            fill={`url(#${gid})`}
          />
          <path
            d="M32 6
               C44 6 54 16 54 30
               C54 42 46 52 32 58
               C18 52 10 42 10 30
               C10 16 20 6 32 6 Z"
            fill={`url(#${gid}-shine)`}
          />
          {/* inner AXE triangle mark */}
          <path
            d="M32 18 L44 44 L20 44 Z"
            fill="rgba(12,14,20,0.22)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* eyes */}
          <g className="eyes">
            <ellipse className="eye left" cx="26" cy="30" rx="3.2" ry="4.2" fill="#0B1220" />
            <ellipse className="eye right" cx="38" cy="30" rx="3.2" ry="4.2" fill="#0B1220" />
            <circle cx="27.2" cy="28.6" r="1.1" fill="rgba(255,255,255,0.75)" />
            <circle cx="39.2" cy="28.6" r="1.1" fill="rgba(255,255,255,0.75)" />
          </g>
        </g>
      </svg>
    </span>
  );
}
