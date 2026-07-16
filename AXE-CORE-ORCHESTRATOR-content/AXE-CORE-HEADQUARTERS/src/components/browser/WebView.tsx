import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, Loader2, ExternalLink, AlertTriangle, Eye, FileText } from 'lucide-react';

interface WebViewProps {
  url: string;
  onTitleChange?: (title: string) => void;
  onNavigate?: (url: string) => void;
}

// Sites that strictly block everything — skip straight to proxy
const STRICT_BLOCKERS = [
  'google.com', 'google.nl', 'youtube.com', 'github.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'chatgpt.com', 'claude.ai', 'perplexity.ai',
];

// Sites that work fine with direct iframe
const DIRECT_OK = [
  'wikipedia.org', 'reddit.com', 'stackoverflow.com', 'medium.com',
  'news.ycombinator.com', 'producthunt.com', 'dev.to', 'hashnode.com',
];

function shouldProxyDirectly(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return STRICT_BLOCKERS.some(b => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

function shouldTryDirect(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DIRECT_OK.some(b => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

function getProxyUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

// Fetch page preview for blocked sites
async function fetchPagePreview(url: string): Promise<{ title: string; text: string; links: string[] } | null> {
  try {
    const res = await fetch(`/api/browse?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(14_000),
    });
    if (res.ok) {
      const d = await res.json() as { title?: string; text?: string; links?: string[] };
      if (d.text) return { title: d.title ?? url, text: d.text, links: d.links ?? [] };
    }
  } catch { /* fall through */ }
  return null;
}

export default function WebView({ url, onTitleChange, onNavigate }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'direct' | 'proxy' | 'preview'>('direct');
  const [preview, setPreview] = useState<{ title: string; text: string; links: string[] } | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Decide mode based on URL
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPreview(null);

    if (shouldProxyDirectly(url)) {
      // Known blockers — go straight to proxy
      setMode('proxy');
      setLoading(false);
      return;
    }

    if (shouldTryDirect(url)) {
      // Known to work direct
      setMode('direct');
      return;
    }

    // Default: try direct first, fallback to proxy
    setMode('direct');

    // Set a timer to check if iframe loaded
    checkTimer.current = setTimeout(() => {
      // If still loading after 4s, switch to proxy
      setLoading(prev => {
        if (prev) {
          setMode('proxy');
          return false;
        }
        return prev;
      });
    }, 4000);

    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [url]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setMode('direct'); // If it loaded, direct works
    try {
      const iframe = iframeRef.current;
      const title = iframe?.contentWindow?.document?.title;
      if (title) onTitleChange?.(title);
    } catch { /* cross-origin, ignore */ }
  }, [onTitleChange]);

  const handleError = useCallback(() => {
    setLoading(false);
    setMode('proxy');
  }, []);

  const fetchPreview = useCallback(async () => {
    setFetchingPreview(true);
    const p = await fetchPagePreview(url);
    setPreview(p);
    setFetchingPreview(false);
    setMode('preview');
  }, [url]);

  const openExternal = useCallback(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  // Proxy mode render
  if (mode === 'proxy') {
    const proxyUrl = getProxyUrl(url);
    return (
      <div className="relative w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030405] z-10">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <p className="text-sm text-white/60">Loading via proxy...</p>
            <p className="text-[10px] text-white/30 mt-1">{new URL(url).hostname}</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="accelerometer; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture"
          title="Web Content"
          onLoad={() => setLoading(false)}
        />
      </div>
    );
  }

  // Preview mode (fallback)
  if (mode === 'preview') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#030405] px-6 overflow-y-auto">
        <div className="w-20 h-20 rounded-2xl bg-yellow-400/5 border border-yellow-400/20 flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-yellow-400/60" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">This site requires external viewing</h2>
        <p className="text-sm text-white/40 text-center max-w-md mb-6">
          {new URL(url).hostname} uses advanced security that prevents embedding.
        </p>
        <button
          onClick={openExternal}
          className="flex items-center gap-2 px-6 h-11 rounded-xl bg-cyan-400/20 border border-cyan-400/30 text-cyan-400 text-sm font-medium hover:bg-cyan-400/30 transition-all mb-8"
        >
          <ExternalLink className="w-4 h-4" />
          Open in new tab
        </button>
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
            </div>
          </div>
        )}
      </div>
    );
  }

  // Direct iframe mode
  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030405] z-10">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
          <p className="text-sm text-white/60">Loading {new URL(url).hostname}...</p>
          <p className="text-[10px] text-white/30 mt-2">Direct connection</p>
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
