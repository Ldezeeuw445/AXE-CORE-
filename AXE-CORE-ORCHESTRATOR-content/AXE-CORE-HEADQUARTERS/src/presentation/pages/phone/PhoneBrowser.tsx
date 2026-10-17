/**
 * Safari-achtige browser op de telefoon. Echte navigatie via useBrowserStore + WebView.
 * Device Manager-tabs verdwijnen (AppShell); AXE-mark gaat naar Home.
 */
import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router';
import { Bookmark, ChevronLeft, ChevronRight, Copy, LayoutGrid, Share, X } from 'lucide-react';
import WebView from '@/presentation/components/browser/WebView';
import type { LiveBrowserNav } from '@/presentation/components/browser/LiveBrowserView';
import { useBrowserStore } from '@/presentation/hooks/useBrowserStore';
import { sendBrowserAIMessage } from '@/application/browser/browserAIService';
import { PhoneKaart, PhoneKop } from '@/presentation/pages/phone/phoneUi';

function hostVan(url: string): string {
  try { return new URL(url.includes('://') ? url : `https://${url}`).host; } catch { return url; }
}

export default function PhoneBrowser() {
  const navigate = useNavigate();
  const {
    tabs, activeTab, isHome, quickLinks, bookmarks, history,
    addTab, closeTab, switchTab, navigateTo, addBookmark,
  } = useBrowserStore();
  const [adres, setAdres] = useState(activeTab.url || '');
  const [blad, setBlad] = useState<'geen' | 'tabs' | 'marks' | 'share' | 'reader'>('geen');
  const [reader, setReader] = useState<string>('');
  const navRef = useRef<LiveBrowserNav | null>(null);

  const go = useCallback((ruw: string) => {
    const t = ruw.trim();
    if (!t) { navigateTo('', 'New Tab'); setAdres(''); return; }
    const url = /^https?:\/\//i.test(t) || t.startsWith('about:')
      ? t
      : t.includes('.') && !t.includes(' ')
        ? `https://${t}`
        : `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    navigateTo(url, t);
    setAdres(url);
    setBlad('geen');
  }, [navigateTo]);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden" data-axe-phone-app="browser">
      <div className="flex min-h-[44px] flex-none items-center gap-1.5 px-1" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button
          type="button"
          data-axe-browser-home
          aria-label="Back to Home"
          onClick={() => navigate('/mobile')}
          className="flex size-11 items-center justify-center rounded-full text-[13px] font-bold"
          style={{ color: '#22d3ee' }}
        >
          AXE
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => { e.preventDefault(); go(adres); }}
        >
          <input
            data-axe-browser-adres
            value={adres}
            onChange={(e) => setAdres(e.target.value)}
            placeholder="Search or enter site"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-[44px] w-full rounded-full px-3 text-[13px]"
            style={{
              background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
              border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
              color: 'var(--text-primary)',
            }}
          />
        </form>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
        ) : (
          <WebView
            url={activeTab.url}
            mobile
            navRef={navRef as MutableRefObject<LiveBrowserNav | null>}
            onPageChange={(url) => { setAdres(url); navigateTo(url); }}
          />
        )}

        {blad === 'tabs' && (
          <div className="absolute inset-0 z-20 overflow-auto px-2 py-2" data-axe-browser-tabs style={{ background: 'var(--bg-base, #05070b)' }}>
            <PhoneKop
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
            <PhoneKop title="Bookmarks" extra={<button type="button" className="min-h-[44px] px-2" onClick={() => setBlad('geen')}>Done</button>} />
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
            <PhoneKop title="Reader" extra={<button type="button" className="min-h-[44px] px-2" onClick={() => setBlad('geen')}>Done</button>} />
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

      <nav className="flex flex-none items-stretch justify-around" data-axe-safari-voet aria-label="Browser chrome" style={{ minHeight: 44 }}>
        <button type="button" aria-label="Back" className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => { void navRef.current?.back(); }}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label="Forward" className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => { void navRef.current?.forward(); }}>
          <ChevronRight size={18} />
        </button>
        <button type="button" aria-label="Share" className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'share' ? 'geen' : 'share')}>
          <Share size={16} />
        </button>
        <button type="button" aria-label="Bookmarks" className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'marks' ? 'geen' : 'marks')}>
          <Bookmark size={16} />
        </button>
        <button type="button" aria-label="Tabs" className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => setBlad(blad === 'tabs' ? 'geen' : 'tabs')}>
          <LayoutGrid size={16} />
        </button>
      </nav>
    </div>
  );
}
