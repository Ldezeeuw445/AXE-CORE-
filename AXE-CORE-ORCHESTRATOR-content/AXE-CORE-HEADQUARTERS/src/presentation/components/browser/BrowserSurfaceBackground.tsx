import type { BrowserSurfaceTheme } from '@/presentation/hooks/useBrowserSurfaceTheme';
import { Ground } from '@/presentation/components/surface/Surface';

interface BrowserSurfaceBackgroundProps {
  theme: BrowserSurfaceTheme;
  className?: string;
}

/** Background layer only — toggles between AXE ground and Comet-style glass. */
export function BrowserSurfaceBackground({ theme, className = '' }: BrowserSurfaceBackgroundProps) {
  if (theme === 'axe') {
    return <Ground className={`absolute inset-0 -z-10 ${className}`} aria-hidden />;
  }

  return (
    <div
      className={`absolute inset-0 -z-10 overflow-hidden ${className}`}
      aria-hidden
      style={{
        background:
          'radial-gradient(120% 90% at 15% 20%, rgba(168, 85, 247, 0.35), transparent 55%),' +
          'radial-gradient(90% 70% at 85% 75%, rgba(236, 72, 153, 0.28), transparent 50%),' +
          'radial-gradient(80% 60% at 50% 100%, rgba(59, 130, 246, 0.22), transparent 55%),' +
          'linear-gradient(145deg, #0a0612 0%, #120818 35%, #0a1020 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backdropFilter: 'blur(80px) saturate(140%)',
          WebkitBackdropFilter: 'blur(80px) saturate(140%)',
        }}
      />
    </div>
  );
}
