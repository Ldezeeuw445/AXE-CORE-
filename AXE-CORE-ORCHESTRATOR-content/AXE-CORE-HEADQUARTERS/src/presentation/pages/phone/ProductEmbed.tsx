/**
 * Product-tab onder de app-balk (AXON / Companion). Geen ‹ More, geen
 * onderbalk, geen overlay-WebView die de hamburger bedekt. De iframe blijft
 * in déze WebView zodat de login-cookie blijft staan. Als de native app
 * geïnstalleerd is, openen we die ernaast — terugkeren toont dezelfde sessie.
 */
import { useEffect, useState } from 'react';
import { isAppInstalled, openAndroidApp } from '@/infrastructure/gateways/androidAppsBridge';
import { AXON_PACKAGE, COMPANION_PACKAGE } from '@/infrastructure/gateways/androidBrowseBridge';

export const AXON_URL = 'https://app.axon-memory.com/';
export const COMPANION_URL = 'https://axecompanion.com/chat';

export function ProductEmbed({
  naam, src, testid, pakket,
}: {
  naam: string;
  src: string;
  testid: string;
  pakket?: string;
}) {
  const [klaar, setKlaar] = useState(false);

  useEffect(() => {
    if (pakket && isAppInstalled(pakket)) openAndroidApp(pakket);
  }, [pakket]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-axe-embed={testid}
    >
      {!klaar && (
        <div
          className="absolute inset-0 z-0 flex items-center justify-center px-6 text-center text-[13px]"
          style={{ color: 'var(--text-muted)' }}
          data-axe-embed-wacht={testid}
        >
          Opening {naam}…
        </div>
      )}
      <iframe
        title={naam}
        src={src}
        data-axe-embed-frame={testid}
        className="relative z-[1] min-h-0 w-full flex-1 border-0 bg-transparent"
        referrerPolicy="no-referrer-when-downgrade"
        allow="clipboard-read; clipboard-write; microphone; camera"
        onLoad={() => setKlaar(true)}
      />
    </div>
  );
}

export default function CompanionPage() {
  return <ProductEmbed naam="AXE Companion" src={COMPANION_URL} testid="companion" pakket={COMPANION_PACKAGE} />;
}

export function AxonPage() {
  return <ProductEmbed naam="AXON Memory" src={AXON_URL} testid="axon" pakket={AXON_PACKAGE} />;
}
