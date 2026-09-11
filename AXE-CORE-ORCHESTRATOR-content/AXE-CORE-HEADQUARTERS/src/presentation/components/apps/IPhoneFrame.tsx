import type { ReactNode } from 'react';

export const IPHONE_W = 390;
export const IPHONE_H = 844;

export type IPhoneSize = 'sm' | 'md' | 'lg' | 'fill';

const SIZE_SCALE: Record<Exclude<IPhoneSize, 'fill'>, number> = {
  sm: 0.62,
  md: 0.78,
  lg: 0.92,
};

interface IPhoneFrameProps {
  children: ReactNode;
  /** Visual scale. `fill` fits parent width up to 390px. */
  size?: IPhoneSize;
  /** App name under the Dynamic Island (optional). */
  title?: string;
  /** Show status bar clock / signal / battery. Default true. */
  statusBar?: boolean;
  /** Show home indicator. Default true. */
  homeIndicator?: boolean;
  className?: string;
}

function StatusBar({ title }: { title?: string }) {
  const time = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-7 pt-3 pointer-events-none"
      style={{ height: 54 }}
      aria-hidden
    >
      <span className="text-[13px] font-semibold tabular-nums text-white/90 w-[72px]">{time}</span>
      <div className="flex-1 flex justify-center">
        {/* Dynamic Island */}
        <div className="relative h-[34px] w-[126px] rounded-full bg-black flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          {title ? (
            <span className="text-[9px] font-medium text-white/50 truncate max-w-[90px] px-2">{title}</span>
          ) : (
            <span className="absolute right-4 w-2.5 h-2.5 rounded-full bg-[#1a1a1c] ring-1 ring-white/10" />
          )}
        </div>
      </div>
      <div className="w-[72px] flex items-center justify-end gap-1.5 text-white/90">
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="3" height="5" rx="0.6" opacity="0.35" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.6" opacity="0.55" />
          <rect x="9" y="2.5" width="3" height="9.5" rx="0.6" opacity="0.75" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.6" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 2.2c2.2 0 4.1 1 5.4 2.5l-1.1 1.1C11.3 4.5 9.8 3.8 8 3.8S4.7 4.5 3.7 5.8L2.6 4.7C3.9 3.2 5.8 2.2 8 2.2z" opacity="0.4" />
          <path d="M8 5c1.4 0 2.6.6 3.4 1.5L10.3 7.6C9.8 7 8.9 6.6 8 6.6s-1.8.4-2.3 1L4.6 6.5C5.4 5.6 6.6 5 8 5z" opacity="0.7" />
          <circle cx="8" cy="9.5" r="1.4" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.5" stroke="currentColor" strokeOpacity="0.35" fill="none" />
          <rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor" />
          <rect x="23.5" y="4" width="2.5" height="5" rx="1" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Reusable iPhone chrome — put any app UI (iframe, route, React children) inside.
 * Matches LiveBrowserView mobile viewport (390×844).
 */
export function IPhoneFrame({
  children,
  size = 'md',
  title,
  statusBar = true,
  homeIndicator = true,
  className = '',
}: IPhoneFrameProps) {
  const scale = size === 'fill' ? 1 : SIZE_SCALE[size];
  const width = size === 'fill' ? 'min(100%, 390px)' : `${Math.round(IPHONE_W * scale)}px`;
  const height = size === 'fill'
    ? `min(100%, ${IPHONE_H}px)`
    : `${Math.round(IPHONE_H * scale)}px`;

  return (
    <div
      className={`relative mx-auto select-none ${className}`}
      style={{
        width,
        height,
        maxWidth: IPHONE_W,
        aspectRatio: `${IPHONE_W} / ${IPHONE_H}`,
      }}
    >
      {/* Bezel */}
      <div
        className="absolute inset-0 rounded-[48px] p-[10px]"
        style={{
          background:
            'linear-gradient(160deg, #3a3a3e 0%, #1a1a1c 28%, #0a0a0b 70%, #222226 100%)',
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.08), 0 28px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {/* Side buttons (decorative) */}
        <div className="absolute -left-[3px] top-[120px] w-[3px] h-[28px] rounded-l-sm bg-[#2a2a2e]" />
        <div className="absolute -left-[3px] top-[168px] w-[3px] h-[52px] rounded-l-sm bg-[#2a2a2e]" />
        <div className="absolute -left-[3px] top-[230px] w-[3px] h-[52px] rounded-l-sm bg-[#2a2a2e]" />
        <div className="absolute -right-[3px] top-[180px] w-[3px] h-[80px] rounded-r-sm bg-[#2a2a2e]" />

        {/* Screen */}
        <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-black">
          {statusBar && <StatusBar title={title} />}

          {/* Content — padded under status bar so apps aren't hidden under island */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ paddingTop: statusBar ? 54 : 0, paddingBottom: homeIndicator ? 22 : 0 }}
          >
            <div className="w-full h-full overflow-hidden bg-black">{children}</div>
          </div>

          {homeIndicator && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
              <div className="w-[128px] h-[5px] rounded-full bg-white/35" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IPhoneFrame;
