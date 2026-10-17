/**
 * Safari-achtige browser op de telefoon. Geen Mac-mini-proxy: op Android een
 * echte WebView (JS-bridge), elders een iframe met mobiele layout.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Copy, LayoutGrid, RotateCw, Share, X } from 'lucide-react';
import { useBrowserStore } from '@/presentation/hooks/useBrowserStore';
import { sendBrowserAIMessage } from '@/application/browser/browserAIService';
import {
  nativeBrowseAvailable, nativeBrowseBack, nativeBrowseForward, nativeBrowseOpen, nativeBrowseReload,
} from '@/infrastructure/gateways/androidBrowseBridge';
import { PhoneKaart } from '@/presentation/pages/phone/phoneUi';

function OverlayKop({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-[44px] items-center justify-between gap-2">
      <h2 className="m-0 text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {extra}
    </div>
  );
}

function hostVan(url: string): string {
  try { return new URL(url.includes('://') ? url : `https://${url}`).host.replace(/^www\./, ''); } catch { return url; }
}

function maakUrl(ruw: string): string {
  const t = ruw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t) || t.startsWith('about:')) return t;
  if (t.includes('.') && !t.includes(' ')) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

export default function PhoneBrowser() {
  const {
    tabs, activeTab, isHome, quickLinks, bookmarks, history,
    addTab, closeTab, switchTab, navigateTo, addBookmark,
  } = useBrowserStore();
  const [adres, setAdres] = useState(activeTab.url || '');
  const [focus, setFocus] = useState(false);
  const [blad, setBlad] = useState<'geen' | 'tabs' | 'marks' | 'share' | 'reader'>('geen');
  const [reader, setReader] = useState<string>('');
  const invoer = useRef<HTMLInputElement>(null);
  const native = nativeBrowseAvailable();
  const [herlaad, setHerlaad] = useState(0);
  const trek = useRef({ y: 0, aan: false });

  useEffect(() => {
    if (!focus) setAdres(activeTab.url || '');
  }, [activeTab.url, focus]);

  const go = useCallback((ruw: string) => {
    const url = maakUrl(ruw);
    if (!url) { navigateTo('', 'New Tab'); setAdres(''); return; }
    navigateTo(url, hostVan(url));
    setAdres(url);
    setBlad('geen');
    setFocus(false);
    invoer.current?.blur();
    if (native) nativeBrowseOpen(url);
  }, [navigateTo, native]);

  useEffect(() => {
    if (native && activeTab.url) nativeBrowseOpen(activeTab.url);
  }, [native, activeTab.url]);

  const toon = focus ? adres : (activeTab.url ? hostVan(activeTab.url) : adres);

  const herladen = useCallback(() => {
    if (native) nativeBrowseReload();
    else setHerlaad((n) => n + 1);
  }, [native]);

  const opTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const vak = e.currentTarget;
    if (vak.scrollTop > 8) return;
    trek.current = { y: e.touches[0]?.clientY ?? 0, aan: true };
  };
  const opTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (!trek.current.aan) return;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - trek.current.y;
    trek.current.aan = false;
    if (dy > 56) herladen();
  };

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden" data-axe-phone-app="browser">
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onTouchStart={opTouchStart}
        onTouchEnd={opTouchEnd}
      >
        {isHome || !activeTab.url ? (
          <div className="h-full overflow-auto px-1" data-axe-browser-start>
            <div className="grid grid-cols-2 gap-2 pb-3">
              {quickLinks.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => go(l.url)}
                  className="min-h-[88px] rounded-[18px] px-3 text-left text-[13px] font-semibold"
                  style={{
                    background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
                    border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
                    color: 'var(--text-primary)',
                  }}
                >
                  {l.title}
                </button>
              ))}
            </div>
          </div>
        ) : native ? (
          <div className="flex h-full items-center justify-center text-[12px]" data-axe-native-browse style={{ color: 'var(--text-muted)' }}>
            {hostVan(activeTab.url)}
          </div>
        ) : (
          <iframe
            key={`wv-${activeTab.id}-${herlaad}`}
            title={activeTab.title || hostVan(activeTab.url)}
            src={activeTab.url}
            data-axe-phone-webview
            className="h-full w-full border-0 bg-white"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        )}

        {blad === 'tabs' && (
          <div className="absolute inset-0 z-20 overflow-auto px-2 py-2" data-axe-browser-tabs style={{ background: 'var(--bg-base, #05070b)' }}>
            <OverlayKop
              title="Tabs"
              extra={<button type="button" className="min-h-[44px] px-2" onClick={() => { addTab(); setAdres(''); setBlad('geen'); }}>+ New</button>}
            />
            <div className="grid grid-cols-2 gap-2">
              {tabs.map((t) => (
                <div key={t.id} className="relative rounded-2xl p-3" style={{ background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))', border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))' }}>
                  <button type="button" className="min-h-[44px] w-full text-left text-[12px]" onClick={() => { switchTab(t.id); setAdres(t.url); setBlad('geen'); }}>
                    {t.title || hostVan(t.url) || 'New Tab'}
                  </button>
                  <button type="button" aria-label="Close tab" className="absolute right-1 top-1 flex size-11 items-center justify-center" onClick={() => closeTab(t.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {blad === 'marks' && (
          <div className="absolute inset-0 z-20 overflow-auto px-2 py-2" data-axe-browser-marks style={{ background: 'var(--bg-base, #05070b)' }}>
            <OverlayKop title="Bookmarks" extra={<button type="button" className="min-h-[44px] px-2" onClick={() => setBlad('geen')}>Done</button>} />
            <PhoneKaart kicker="Saved">
              {bookmarks.map((b) => (
                <button key={b.id} type="button" className="flex min-h-[44px] w-full items-center text-left text-[13px]" onClick={() => go(b.url)}>
                  {b.title || b.url}
                </button>
              ))}
            </PhoneKaart>
            <PhoneKaart kicker="History">
              {history.slice(0, 20).map((h) => (
                <button key={h.id} type="button" className="flex min-h-[44px] w-full items-center text-left text-[13px]" onClick={() => go(h.url)}>
                  {h.title || h.url}
                </button>
              ))}
            </PhoneKaart>
          </div>
        )}

        {blad === 'share' && (
          <div className="absolute inset-x-0 bottom-0 z-20 p-2" data-axe-browser-share>
            <PhoneKaart kicker="Share">
              <button type="button" className="flex min-h-[44px] w-full items-center gap-2" onClick={() => { void navigator.clipboard?.writeText(activeTab.url); setBlad('geen'); }}>
                <Copy size={14} /> Copy
              </button>
              <button type="button" className="flex min-h-[44px] w-full items-center gap-2" onClick={() => { if (activeTab.url) addBookmark(activeTab.title || activeTab.url, activeTab.url, 'AXE'); setBlad('geen'); }}>
                <Bookmark size={14} /> Bookmark
              </button>
              <button type="button" className="flex min-h-[44px] w-full items-center gap-2" onClick={() => { setBlad('reader'); setReader(''); }}>
                Reader
              </button>
            </PhoneKaart>
          </div>
        )}

        {blad === 'reader' && (
          <div className="absolute inset-0 z-20 overflow-auto px-3 py-2" data-axe-browser-reader style={{ background: 'var(--bg-base, #05070b)' }}>
            <OverlayKop title="Reader" extra={<button type="button" className="min-h-[44px] px-2" onClick={() => setBlad('geen')}>Done</button>} />
            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {reader || activeTab.title || hostVan(activeTab.url) || 'Open a page first.'}
            </p>
            <button
              type="button"
              className="mt-3 min-h-[44px] text-[13px]"
              onClick={() => {
                void sendBrowserAIMessage('deepseek', `Summarize this page: ${activeTab.url}`)
                  .then((r) => setReader(r.message))
                  .catch((e) => setReader(e instanceof Error ? e.message : String(e)));
              }}
            >
              Ask AXE to summarize
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-none flex-col" data-axe-safari-voet>
        <form
          className="px-3 pb-1"
          onSubmit={(e) => { e.preventDefault(); go(adres); }}
        >
          <input
            ref={invoer}
            data-axe-browser-adres
            value={toon}
            onChange={(e) => { setFocus(true); setAdres(e.target.value); }}
            onFocus={() => { setFocus(true); setAdres(activeTab.url || adres); }}
            onBlur={() => setFocus(false)}
            placeholder="Search or enter site"
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-[40px] w-full rounded-full px-3 text-center text-[13px]"
            style={{
              background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
              border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
              color: 'var(--text-primary)',
            }}
          />
        </form>
        <nav className="flex items-stretch justify-around" aria-label="Browser chrome" style={{ minHeight: 40 }}>
          <button type="button" aria-label="Back" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={() => { if (!nativeBrowseBack()) window.history.back(); }}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Forward" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={() => { if (!nativeBrowseForward()) window.history.forward(); }}>
            <ChevronRight size={18} />
          </button>
          <button type="button" aria-label="Reload" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={herladen}>
            <RotateCw size={15} />
          </button>
          <button type="button" aria-label="Share" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'share' ? 'geen' : 'share')}>
            <Share size={16} />
          </button>
          <button type="button" aria-label="Bookmarks" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'marks' ? 'geen' : 'marks')}>
            <Bookmark size={16} />
          </button>
          <button type="button" aria-label="Tabs" className="flex min-h-[40px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'tabs' ? 'geen' : 'tabs')}>
            <LayoutGrid size={16} />
          </button>
        </nav>
      </div>
    </div>
  );
}
