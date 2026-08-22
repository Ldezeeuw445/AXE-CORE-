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
 * COORDINATES ARE THE WHOLE TRICK. A click on the picture has to be mapped
 * back to a point on the page. On desktop the browser is now rendered AT the
 * pane's own size, so that mapping is 1:1 and cannot drift; on mobile the page
 * is deliberately rendered at a real phone width and fitted, so the scale
 * factor still applies there. Get this wrong and clicks land further off the
 * further you are from the top-left, which reads as "it works in the corner
 * and nowhere else".
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import {
  browserAgentStart, browserAgentNavigate, browserAgentClick,
  browserAgentType, browserAgentPress, browserAgentScroll,
  browserAgentScreenshot, browserAgentViewport,
} from '@/infrastructure/gateways/axeCoreApiService';

/**
 * The page is rendered at the SIZE OF THE PANE, not at a fixed desktop size.
 *
 * The first version rendered 1280x800 and fitted that into the pane with
 * object-contain, so unless the pane happened to share that aspect ratio you
 * got a letterboxed, shrunken picture — Luka's "smaller image of Google".
 * Matching the viewport to the pane means the screenshot fills it exactly and
 * the coordinate mapping becomes 1:1 instead of a scale factor that can drift.
 */
const MOBILE_W = 390;
const MOBILE_H = 844;
/** Guard rails: a pane can be a sliver mid-drag, and a giant viewport is a
 *  giant screenshot on every poll. */
const MIN_W = 360, MIN_H = 400, MAX_W = 2200, MAX_H = 1600;
/** Resizes are debounced — a drag would otherwise reconfigure the browser on
 *  every animation frame. */
const RESIZE_DEBOUNCE_MS = 250;

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
  const paneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1280, h: 800 });
  // Held in a ref as well: the screenshot poller closes over it and would
  // otherwise keep reading the value from the render it was created in.
  const sidRef = useRef<string | null>(null);

  const vw = mobile ? MOBILE_W : size.w;
  const vh = mobile ? MOBILE_H : size.h;

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

  // Measure the pane. Desktop only: on mobile the point is to ask the site for
  // its phone layout at a real phone width, not for the width of whatever
  // sliver the pane happens to be.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || mobile) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, entry.contentRect.width)));
      const h = Math.round(Math.min(MAX_H, Math.max(MIN_H, entry.contentRect.height)));
      clearTimeout(timer);
      timer = setTimeout(() => setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h })), RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [mobile]);

  // Push the measured size to the live session.
  useEffect(() => {
    if (!sessionId || mobile) return;
    let cancelled = false;
    (async () => {
      try {
        await browserAgentViewport(sessionId, size.w, size.h);
        if (!cancelled) await refresh(sessionId);
      } catch { /* the old size still renders; not worth an error banner */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId, size.w, size.h, mobile, refresh]);

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

  // SCROLLING HAS TO BE ACCUMULATED, NOT FORWARDED PER EVENT.
  //
  // A single flick of a trackpad emits dozens of wheel events. The first
  // version fired one API call per event, so they queued, raced each other and
  // each dragged a screenshot refresh behind it — which from the outside looks
  // exactly like scrolling being broken. Deltas are summed and flushed once,
  // which is also what the page itself would have received from a real wheel.
  const pendingScroll = useRef(0);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onWheel = (e: React.WheelEvent) => {
    if (!sessionId) return;
    pendingScroll.current += e.deltaY;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const dy = pendingScroll.current;
      pendingScroll.current = 0;
      if (!dy) return;
      void browserAgentScroll(sessionId, dy)
        .then(() => refresh(sessionId))
        .catch(() => { /* a dropped scroll is not worth an error banner */ });
    }, 90);
  };

  return (
    <div ref={paneRef} className="relative w-full h-full flex items-center justify-center bg-black/40 overflow-hidden">
      {shot ? (
        <img
          ref={imgRef}
          src={shot}
          alt=""
          tabIndex={0}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          // Desktop renders at pane size, so the picture fills it exactly.
          // Mobile keeps a real phone viewport and is fitted, because a 390px
          // page stretched over a tablet-width pane is not what the site looks
          // like on a phone.
          className={mobile
            ? 'max-w-full max-h-full object-contain cursor-pointer outline-none'
            : 'w-full h-full object-fill cursor-pointer outline-none'}
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
