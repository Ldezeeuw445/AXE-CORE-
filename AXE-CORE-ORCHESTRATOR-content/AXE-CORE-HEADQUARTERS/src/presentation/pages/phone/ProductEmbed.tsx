/**
 * Product-tab onder de HQ-app-balk (AXON / Companion). Altijd de iframe van
 * de website. Een native TWA/Custom Tab verlaat Device Manager en neemt
 * hamburger + app-balk mee, dus die starten we hier niet.
 */
import { useState } from 'react';

export const AXON_URL = 'https://app.axon-memory.com/';
export const COMPANION_URL = 'https://axecompanion.com/chat';

export function ProductEmbed({
  naam, src, testid,
}: {
  naam: string;
  src: string;
  testid: string;
}) {
  const [klaar, setKlaar] = useState(false);

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
  return <ProductEmbed naam="AXE Companion" src={COMPANION_URL} testid="companion" />;
}

export function AxonPage() {
  return <ProductEmbed naam="AXON Memory" src={AXON_URL} testid="axon" />;
}
