/**
 * Vol-scherm iframe van een productie-app (AXON / Companion).
 * Geen herimplementatie, geen composer. Terug naar More.
 */
import { useNavigate } from 'react-router';

export const AXON_URL = 'https://app.axon-memory.com/';
export const COMPANION_URL = 'https://axecompanion.com/';

export function ProductEmbed({
  naam, src, testid,
}: {
  naam: string;
  src: string;
  testid: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-axe-embed={testid}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex min-h-[44px] flex-none items-center gap-2 px-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button
          type="button"
          data-axe-embed-terug
          onClick={() => navigate('/apps')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[13px] font-medium"
          style={{
            background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
            border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
            color: 'var(--text-primary)',
          }}
          aria-label="Back to More"
        >
          ‹ More
        </button>
        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{naam}</div>
      </div>
      <iframe
        title={naam}
        src={src}
        data-axe-embed-frame={testid}
        className="min-h-0 w-full flex-1 border-0 bg-black"
        referrerPolicy="no-referrer-when-downgrade"
        allow="clipboard-read; clipboard-write; microphone; camera"
      />
    </div>
  );
}

export default function CompanionPage() {
  return <ProductEmbed naam="AXE Companion" src={COMPANION_URL} testid="companion" />;
}
