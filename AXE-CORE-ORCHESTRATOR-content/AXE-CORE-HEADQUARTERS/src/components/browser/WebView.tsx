import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, Loader2, ExternalLink, AlertTriangle, Eye, FileText, X } from 'lucide-react';

interface WebViewProps {
  url: string;
  onTitleChange?: (title: string) => void;
}

// Sites known to block iframes — always open externally
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

// Fetch page content via CORS proxy for AI preview
async function fetchPagePreview(url: string): Promise<{ title: string; text: string; links: string[] } | null> {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  ];
  
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const html = data.contents || '';
      
      // Extract title
      const titleMatch = html.match(/<title[^\u003e]*>([^\u003c]*)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || 'Untitled Page';
      
      // Extract text (remove scripts, styles, etc)
      let text = html
        .replace(/<script[^\u003e]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^\u003e]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^\u003e]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Truncate
      text = text.slice(0, 5000);
      
      // Extract links
      const linkMatches = html.matchAll(/href="([^"]+)"/gi);
      const links = [...new Set([...linkMatches].map(m => m[1]).filter(l => l.startsWith('http')).slice(0, 10))];
      
      return { title, text, links };
    } catch { /* try next proxy */ }
  }
  return null;
}

export default function WebView({ url, onTitleChange }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [preview, setPreview] = useState<{ title: string; text: string; links: string[] } | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setLoading(true);
    setBlocked(false);
    setPreview(null);
    setIframeFailed(false);
    setFetchingPreview(false);

    // Check if this site is known to block iframes
    if (isIframeBlocked(url)) {
      setBlocked(true);
      setLoading(false);
      // Auto-fetch preview for blocked sites
      setFetchingPreview(true);
      fetchPagePreview(url).then(p => {
        setPreview(p);
        setFetchingPreview(false);
        if (p?.title) onTitleChange?.(p.title);
      });
      return;
    }

    // Try iframe — check after 3 seconds if it actually loaded
    checkTimer.current = setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (iframe) {
          // Try to access contentWindow — if blocked, this throws
          const doc = iframe.contentWindow?.document;
          if (!doc || doc.body?.innerHTML === '' || doc.body?.innerHTML === '<html><head></head><body></body></html>') {
            setIframeFailed(true);
            setBlocked(true);
            setLoading(false);
          }
        }
      } catch {
        // Cross-origin error = blocked
        setIframeFailed(true);
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
    // If it loaded, try to get title
    try {
      const iframe = iframeRef.current;
      const title = iframe?.contentWindow?.document?.title;
      if (title) onTitleChange?.(title);
    } catch { /* cross-origin, ignore */ }
  }, [onTitleChange]);

  const handleError = useCallback(() => {
    setLoading(false);
    setIframeFailed(true);
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

  if (blocked) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#030405] px-6">
        <div className="w-20 h-20 rounded-2xl bg-yellow-400/5 border border-yellow-400/20 flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-yellow-400/60" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">This site blocks embedded browsing</h2>
        <p className="text-sm text-white/40 text-center max-w-md mb-8">
          {new URL(url).hostname} uses security headers that prevent loading in an iframe.
          This is a browser security feature, not a bug.
        </p>

        <div className="flex gap-3 mb-8">
          <button
            onClick={openExternal}
            className="flex items-center gap-2 px-6 h-11 rounded-xl bg-cyan-400/20 border border-cyan-400/30 text-cyan-400 text-sm font-medium hover:bg-cyan-400/30 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Open in new tab
          </button>

          {!preview && !fetchingPreview && (
            <button
              onClick={fetchPreview}
              className="flex items-center gap-2 px-6 h-11 rounded-xl bg-white/5 border border-white/[0.08] text-white/60 text-sm font-medium hover:bg-white/10 transition-all"
            >
              <Eye className="w-4 h-4" />
              Fetch preview
            </button>
          )}
        </div>

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
                      {new URL(link).hostname}
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
          <p className="text-sm text-white/60">Loading {new URL(url).hostname}...</p>
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
