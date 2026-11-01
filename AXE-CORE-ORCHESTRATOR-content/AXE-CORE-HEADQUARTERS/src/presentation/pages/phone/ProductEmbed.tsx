/**
 * Product-tab onder de HQ-app-balk (AXON / Companion). Altijd de iframe van
 * de website. Een native TWA/Custom Tab verlaat Device Manager en neemt
 * hamburger + app-balk mee, dus die starten we hier niet.
 *
 * sandbox zonder top-navigatie: AXON's login doet anders window.top
 * (of een OAuth-redirect) en Android opent dan Chrome. De sessie hoort in HQ.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ontwerpModus } from '@/infrastructure/supabase/ontwerpModus';
import {
  AXON_SITE,
  axonEmbedUrl,
  axonInloggen,
  axonSessieKlaar,
  leesAxonSessie,
  type AxonSessie,
} from '@/infrastructure/gateways/axonSessie';

export const AXON_URL = AXON_SITE;
export const COMPANION_URL = 'https://axecompanion.com/chat';

/** Geen top-navigatie, geen popup die de WebView verlaat. */
export const PRODUCT_IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads';

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
        sandbox={PRODUCT_IFRAME_SANDBOX}
        allow="clipboard-read; clipboard-write; microphone; camera"
        onLoad={() => setKlaar(true)}
      />
    </div>
  );
}

export default function CompanionPage() {
  return (
    <div className="axe-companion-v3 flex h-full min-h-0 flex-1 flex-col" data-axe-companion="v3">
      <ProductEmbed naam="AXE Companion" src={COMPANION_URL} testid="companion" />
    </div>
  );
}

function AxonInlog({ onKlaar }: { onKlaar: (s: AxonSessie) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const verstuur = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || bezig) return;
    setBezig(true);
    setFout(null);
    const uit = await axonInloggen(email, password);
    setBezig(false);
    if (uit.sessie) onKlaar(uit.sessie);
    else setFout(uit.fout ?? 'Sign-in failed.');
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-auto px-5"
      data-axe-axon-inlog
    >
      <form onSubmit={(e) => void verstuur(e)} className="flex w-full max-w-sm flex-col gap-3">
        <p className="m-0 text-center text-[13px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          Sign in once. AXON stays in HQ — a browser tab would leave Device Manager.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          autoComplete="username"
          className="axe-input w-full px-3.5 py-3 text-[13px]"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete="current-password"
          className="axe-input w-full px-3.5 py-3 text-[13px]"
        />
        {fout && (
          <p className="m-0 text-[12px] leading-snug" style={{ color: 'var(--error, #EF4444)' }}>{fout}</p>
        )}
        <button
          type="submit"
          disabled={bezig}
          className="min-h-11 w-full rounded-[10px] text-[13px] font-semibold"
          style={{ background: '#E8B931', color: '#1a1408' }}
        >
          {bezig ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export function AxonPage() {
  const [sessie, setSessie] = useState<AxonSessie | null>(() => leesAxonSessie());
  const [klaar, setKlaar] = useState(() => ontwerpModus() || Boolean(leesAxonSessie()));

  useEffect(() => {
    if (ontwerpModus()) return;
    let weg = false;
    void axonSessieKlaar().then((s) => {
      if (weg) return;
      setSessie(s);
      setKlaar(true);
    });
    return () => { weg = true; };
  }, []);

  if (!klaar) {
    return (
      <div className="flex h-full items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        Opening AXON Memory…
      </div>
    );
  }
  if (!ontwerpModus() && !sessie) {
    return <AxonInlog onKlaar={setSessie} />;
  }
  return (
    <ProductEmbed
      naam="AXON Memory"
      src={ontwerpModus() ? AXON_URL : axonEmbedUrl(sessie)}
      testid="axon"
    />
  );
}
