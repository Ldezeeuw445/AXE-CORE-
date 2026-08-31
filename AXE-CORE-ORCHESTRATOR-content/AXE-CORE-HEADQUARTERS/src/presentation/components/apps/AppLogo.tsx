/**
 * AppLogo — the app's own icon, with an honest fallback.
 *
 * The registry has carried `icon_url` for a while and the tab drew a generic
 * window glyph for every row regardless, so Axon Memory looked identical to a
 * blank entry even though its icon URL was sitting right there in the column.
 *
 * A remote icon can fail in two ways that matter: the row has no URL, or it
 * has one that does not load (offline, moved, a 404 from a site that has since
 * been rebuilt). Both land on the same fallback — the app's initials in its own
 * colour — because a broken-image glyph reads as "this app is broken" rather
 * than "this picture is missing".
 */
import { useState } from 'react';

interface AppLogoProps {
  name: string;
  iconUrl?: string | null;
  color?: string | null;
  size?: number;
}

/** First letters of the first two words: "Axon Memory" → "AM". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export default function AppLogo({ name, iconUrl, color, size = 32 }: AppLogoProps) {
  const [failed, setFailed] = useState(false);
  const tint = color || 'var(--accent-cyan)';
  const showImage = Boolean(iconUrl) && !failed;

  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: `${tint}18`,
        border: `1px solid ${tint}44`,
      }}
    >
      {showImage ? (
        <img
          src={iconUrl as string}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover"
          // Icons are decorative here — the name is right next to them — so a
          // slow one must never hold up the first paint of the grid.
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="font-semibold leading-none"
          style={{ color: tint, fontSize: Math.round(size * 0.34) }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
