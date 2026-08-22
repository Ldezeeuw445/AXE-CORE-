/**
 * LiveBrowserView — a real browser you can see and click.
 *
 * WHY THIS REPLACES THE IFRAME
 *
 * An iframe cannot show most of the web. X-Frame-Options and CSP
 * frame-ancestors are set by the site, not by us, and no amount of proxying
 * changes that — Google, YouTube, GitHub, every bank, most login pages. The old
 * WebView kept a hand-written blocklist of "sites known to block iframes",
 * which is a list that can only ever be incomplete: every site NOT on it that
 * blocks frames failed silently, as a blank rectangle.
 *
 * Behind that sat three fallbacks that disagreed with each other — iframe,
 * Airtop cloud window, scraped text preview — so the same URL could render
 * three different ways depending on which one happened to answer. That is the
 * inconsistency, not a cosmetic problem.
 *
 * This is one path: a headless Chromium on the VPS, screenshotted, with clicks
 * and keystrokes forwarded back. It works on every site because it IS a
 * browser, and it is the same session the agent drives — so what Luka sees and
 * what AXE acts on cannot drift apart.
 *
 * COORDINATES ARE THE WHOLE TRICK. The page renders at VIEWPORT_W x VIEWPORT_H
 * and is displayed at whatever size the pane happens to be. A click has to be
 * mapped back through that scale or every click lands somewhere else — further
 * off the further you are from the top-left, which reads as "it works near the
 * corner and not elsewhere".
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import {
  browserAgentStart, browserAgentNavigate, browserAgentClick,
  browserAgentType, browserAgentPress, browserAgentScroll,
  browserAgentScreenshot, browserAgentViewport,
} from '@/infrastructure/gateways/axeCoreApiService';

/** Must match the viewport the session is created with. */
const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;
const MOBILE_W = 390;
const MOBILE_H = 844;

interface Props {
  url: string;
  mobile?: boolean;
  onTitleChange?: (title: string) => void;
  /** Handed up so the agent panel drives the SAME session the user is looking at. */
  onSession?: (sessionId: string | null) => void;
}

export default function LiveBrowserView({ url, mobile = false, onTitleChange, onSession }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Held in a ref as well: the screenshot poller closes over it and would
  // otherwise keep reading the value from the render it was created in.
  const sidRef = useRef<string | null>(null);

  const vw = mobile ? MOBILE_W : VIEWPORT_W;
  const vh = mobile ? MOBILE_H : VIEWPORT_H;

  const refresh = useCallback(async (sid: string) => {
    try {
      const blob = await browserAgentScreenshot(sid);
      // Revoke the previous object URL — a screenshot every 1.5s leaks a blob
      // per frame otherwise, which on a long session is real memory.
      setShot(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'screenshot failed');
    }
  }, []);

  // One session per mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const { session_id } = await browserAgentStart();
        if (cancelled) return;
        sidRef.current = session_id;
        setSessionId(session_id);
        onSession?.(session_id);
        if (mobile) await browserAgentViewport(session_id, MOBILE_W, MOBILE_H).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'could not start a browser session');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      onSession?.(null);
      // Deliberately NOT closing the session here: the agent panel may still be
      // driving it, and a closed session mid-task is worse than one that idles
      // out. The backend reaps after SESSION_IDLE_TIMEOUT.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  // Navigate whenever the address changes.
  useEffect(() => {
    if (!sessionId || !url) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const state = await browserAgentNavigate(sessionId, url);
        if (cancelled) return;
        onTitleChange?.(state.title || url);
        await refresh(sessionId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'navigation failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, url]);

  // Keep the picture live. Slow enough not to be a load problem, fast enough
  // that a page the agent just changed does not look frozen.
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => { void refresh(sessionId); }, 1500);
    return () => clearInterval(t);
  }, [sessionId, refresh]);

  /** Screen point -> page point. See the note at the top of this file. */
  const toPage = (clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: ((clientX - r.left) / r.width) * vw,
      y: ((clientY - r.top) / r.height) * vh,
    };
  };

  const onClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId) return;
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    try {
      const state = await browserAgentClick(sessionId, p);
      onTitleChange?.(state.title || url);
      await refresh(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'click failed');
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (!sessionId) return;
    // Single printable characters go through `type`; everything else is a key
    // press. Sending "Enter" as text would type the word.
    const isChar = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
    e.preventDefault();
    try {
      if (isChar) await browserAgentType(sessionId, e.key);
      else await browserAgentPress(sessionId, e.key);
      await refresh(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'key failed');
    }
  };

  const onWheel = async (e: React.WheelEvent) => {
    if (!sessionId) return;
    try {
      await browserAgentScroll(sessionId, e.deltaY);
      await refresh(sessionId);
    } catch { /* a dropped scroll is not worth an error banner */ }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black/40 overflow-hidden">
      {shot ? (
        <img
          ref={imgRef}
          src={shot}
          alt=""
          tabIndex={0}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          className="max-w-full max-h-full object-contain cursor-pointer outline-none"
          draggable={false}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/40">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-[11px]">Starting a real browser…</p>
        </div>
      )}

      {busy && shot && (
        <div className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5">
          <Loader2 size={12} className="animate-spin text-white/70" />
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2">
          <AlertTriangle size={13} className="text-red-300 shrink-0" />
          <p className="text-[11px] text-red-200 flex-1 truncate">{error}</p>
          <button
            type="button"
            onClick={() => sessionId && void refresh(sessionId)}
            className="text-[11px] text-red-200 hover:text-white"
          >
            <RotateCw size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
