import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ExternalLink, AlertTriangle, Eye, FileText, MousePointerClick, Cloud } from 'lucide-react';
import { apiUrl } from '@/infrastructure/config/apiUrl';
import { airtopOpen, type AirtopWindow } from '@/infrastructure/gateways/airtopService';

interface WebViewProps {
  url: string;
  onTitleChange?: (title: string) => void;
}

// Sites known to block iframes — always open externally / agent path
const IFRAME_BLOCKED_HOSTS = [
  'google.com', 'google.nl', 'youtube.com', 'github.com', 'facebook.com',
  'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'amazon.com',
  'netflix.com', 'spotify.com', 'apple.com', 'microsoft.com',
  'chatgpt.com', 'claude.ai', 'perplexity.ai', 'openai.com',
];

function isIframeBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IFRAME_BLOCKED_HOSTS.some(b => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

async function fetchPagePreview(url: string): Promise<{ title: string; text: string; links: string[] } | null> {
  try {
    const res = await fetch(apiUrl(`/api/browse?url=${encodeURIComponent(url)}`), {
      signal: AbortSignal.timeout(14_000),
    });
    if (res.ok) {
      const d = await res.json() as { title?: string; text?: string; links?: string[] };
      if (d.text) return { title: d.title ?? url, text: d.text, links: d.links ?? [] };
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { contents?: string };
    const html = data.contents ?? '';
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? 'Untitled Page';
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
    const linkMatches = html.matchAll(/href="(https?:\/\/[^"]+)"/gi);
    const links = [...new Set([...linkMatches].map(m => m[1]).slice(0, 10))];
    return { title, text, links };
  } catch { /* give up */ }
  return null;
}

export default function WebView({ url, onTitleChange }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [preview, setPreview] = useState<{ title: string; text: string; links: string[] } | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  /**
   * Airtop's live view, when we are showing one.
   *
   * This is the only way an in-app browser can work at all: `src={url}` is
   * refused by every site that sets X-Frame-Options, which is why the
   * blocklist above exists and why it will never be long enough. The live
   * view is a page on Airtop's own origin — it embeds, and the Chromium
   * behind it can load anything.
   *
   * Not the default: the free plan allows three concurrent sessions, so a
   * site that iframes happily is still served directly.
   */
  const [cloud, setCloud] = useState<AirtopWindow | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(null);

  /**
   * When the agent opens a page with [AIRTOP:], show what it is looking at.
   *
   * The point of the live view is that the two of you are on the same page —
   * literally. Without this the model would browse somewhere Luka cannot see,
   * which is how an agent ends up trusted for the wrong reasons.
   */
  useEffect(() => {
    const onWindow = (e: Event) => {
      const win = (e as CustomEvent<AirtopWindow>).detail;
      if (win?.liveViewUrl) {
        setCloud(win);
        setCloudError(null);
        setLoading(false);
      }
    };
    window.addEventListener('axe-airtop-window', onWindow);
    return () => window.removeEventListener('axe-airtop-window', onWindow);
  }, []);

  const openCloud = useCallback(async () => {
    setCloudLoading(true);
    setCloudError(null);
    try {
      const win = await airtopOpen(url);
      setCloud(win);
    } catch (err) {
      // Say which failure it was. "Could not open" hides the session limit,
      // and the session limit is the one with an obvious fix.
      setCloudError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    setBlocked(false);
    setPreview(null);
    setFetchingPreview(false);
    setCloud(null);
    setCloudError(null);

    if (isIframeBlocked(url)) {
      setBlocked(true);
      setLoading(false);
      setFetchingPreview(true);
      fetchPagePreview(url).then(p => {
        setPreview(p);
        setFetchingPreview(false);
        if (p?.title) onTitleChange?.(p.title);
      });
      return;
    }

    checkTimer.current = setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (iframe) {
          const doc = iframe.contentWindow?.document;
          if (!doc || doc.body?.innerHTML === '' || doc.body?.innerHTML === '<html><head></head><body></body></html>') {
            setBlocked(true);
            setLoading(false);
          }
        }
      } catch {
        setBlocked(true);
        setLoading(false);
      }
    }, 3000);

    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [url, onTitleChange]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    try {
      const iframe = iframeRef.current;
      const title = iframe?.contentWindow?.document?.title;
      if (title) onTitleChange?.(title);
    } catch { /* cross-origin */ }
  }, [onTitleChange]);

  const handleError = useCallback(() => {
    setLoading(false);
    setBlocked(true);
  }, []);

  const fetchPreview = useCallback(async () => {
    setFetchingPreview(true);
    const p = await fetchPagePreview(url);
    setPreview(p);
    setFetchingPreview(false);
  }, [url]);

  const openExternal = useCallback(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  /** Opens the real Playwright Browser Agent with this URL as the task seed. */
  const openBrowserAgent = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('axe-open-browser-agent', {
        detail: { url, instruction: `Open ${url} and show me the page.` },
      }),
    );
  }, [url]);

  // A real browser, embedded. Takes priority over everything below: once the
  // cloud window is up, the blocked-site apology is no longer true.
  if (cloud) {
    return (
      <div className="relative w-full h-full">
        <iframe
          src={cloud.liveViewUrl}
          className="w-full h-full border-0"
          // No sandbox: this is Airtop's own live-view page driving a remote
          // Chromium over a websocket. Sandboxing it breaks the connection,
          // and the browser it shows is not running on this machine — the
          // page has no access to anything local to sandbox away from.
          allow="clipboard-read; clipboard-write"
          title="Cloud browser"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-black/60 backdrop-blur border border-cyan-400/20">
          <Cloud className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] text-cyan-400/90 font-medium">Cloud browser</span>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#030405] px-5 py-6 overflow-y-auto">
        {/* Compact on a phone: the old layout stacked a 80px badge, a heading,
            a paragraph and four full-width buttons, which ran past the bottom
            of a 384px-wide screen with the primary action below the fold. */}
        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-yellow-400/5 border border-yellow-400/20 flex items-center justify-center mb-4 sm:mb-6 flex-shrink-0">
          <AlertTriangle className="w-7 h-7 sm:w-10 sm:h-10 text-yellow-400/60" />
        </div>

        <h2 className="text-base sm:text-xl font-bold text-white mb-1.5 sm:mb-2 text-center">This site blocks embedded browsing</h2>
        <p className="text-[12px] sm:text-sm text-white/40 text-center max-w-md mb-4">
          {(() => { try { return new URL(url).hostname; } catch { return url; } })()} refuses to load in an iframe.
          Open it in the <span className="text-cyan-400/80">cloud browser</span> — a real Chromium you can watch and take over.
        </p>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-5 sm:mb-8">
          <button
            onClick={openCloud}
            disabled={cloudLoading}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 h-11 rounded-xl bg-cyan-400/20 border border-cyan-400/30 text-cyan-400 text-sm font-medium hover:bg-cyan-400/30 transition-all disabled:opacity-50"
          >
            {cloudLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            {cloudLoading ? 'Starting cloud browser…' : 'Open in cloud browser'}
          </button>

          {/* The three fallbacks share a row instead of each taking one: they
              are alternatives to the primary action, not peers of it. */}
          <button
            onClick={openBrowserAgent}
            className="flex items-center gap-1.5 px-3 sm:px-6 h-9 sm:h-11 rounded-xl bg-white/5 border border-white/[0.08] text-white/60 text-[12px] sm:text-sm font-medium hover:bg-white/10 transition-all"
          >
            <MousePointerClick className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Agent
          </button>

          <button
            onClick={openExternal}
            className="flex items-center gap-1.5 px-3 sm:px-6 h-9 sm:h-11 rounded-xl bg-white/5 border border-white/[0.08] text-white/60 text-[12px] sm:text-sm font-medium hover:bg-white/10 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            New tab
          </button>

          {!preview && !fetchingPreview && (
            <button
              onClick={fetchPreview}
              className="flex items-center gap-1.5 px-3 sm:px-6 h-9 sm:h-11 rounded-xl bg-white/5 border border-white/[0.08] text-white/60 text-[12px] sm:text-sm font-medium hover:bg-white/10 transition-all"
            >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Text
            </button>
          )}
        </div>

        {cloudError && (
          <div className="w-full max-w-2xl mb-4 px-4 py-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20">
            <p className="text-[12px] text-yellow-400/80">{cloudError}</p>
          </div>
        )}

        {fetchingPreview && (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Fetching page preview...
          </div>
        )}

        {preview && (
          <div className="w-full max-w-2xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-white/80">{preview.title}</span>
            </div>
            <div className="max-h-48 overflow-y-auto text-[12px] text-white/50 leading-relaxed space-y-2">
              {preview.text.slice(0, 800).split('. ').map((s, i) => (
                <p key={i}>{s + (s.endsWith('.') ? '' : '. ')}</p>
              ))}
              {preview.text.length > 800 && (
                <p className="text-white/30 italic">... (truncated)</p>
              )}
            </div>
            {preview.links.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.06]">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Links on page</p>
                <div className="flex flex-wrap gap-2">
                  {preview.links.slice(0, 5).map((link, i) => (
                    <a
                      key={i}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-cyan-400/60 hover:text-cyan-400 truncate max-w-[200px]"
                    >
                      {(() => { try { return new URL(link).hostname; } catch { return link; } })()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030405] z-10">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
          <p className="text-sm text-white/60">Loading {(() => { try { return new URL(url).hostname; } catch { return url; } })()}...</p>
          <p className="text-[10px] text-white/30 mt-2">Checking iframe compatibility...</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        allow="accelerometer; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture; usb; vr"
        title="Web Content"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
