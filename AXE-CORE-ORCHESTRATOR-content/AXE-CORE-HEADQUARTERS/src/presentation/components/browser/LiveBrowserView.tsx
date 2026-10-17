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
 *
 * NIET MEER EEUWIG "STARTING" (11 okt). Mislukte de start, dan bleef de
 * spinner draaien met een rode balk "Load failed" eronder, en de knop in die
 * balk ververste alleen een screenshot van een sessie die nooit bestond. Nu
 * zegt het vak wat er misging en start "Try again" echt een nieuwe sessie.
 */
import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react';
import { Loader2, AlertTriangle, RotateCw, Info } from 'lucide-react';
import {
  browserAgentStart, browserAgentNavigate, browserAgentClick,
  browserAgentType, browserAgentPress, browserAgentScroll,
  browserAgentScreenshot, browserAgentViewport, browserAgentHistory,
  browserAgentState, type BrowserAgentPageState,
} from '@/infrastructure/gateways/axeCoreApiService';
import { browserRouteNotice } from '@/infrastructure/persistence/browserHostService';

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
/** Losse toetsaanslagen worden zo lang verzameld en als één `type` verstuurd. */
const TYPE_FLUSH_MS = 70;

/** Terug/vooruit in de pagina zelf. `false` = er was geen stap. */
export interface LiveBrowserNav {
  back: () => Promise<boolean>;
  forward: () => Promise<boolean>;
}

interface Props {
  url: string;
  mobile?: boolean;
  onTitleChange?: (title: string) => void;
  /** Handed up so the agent panel drives the SAME session the user is looking at. */
  onSession?: (sessionId: string | null) => void;
  /** De pagina staat op een ander adres dan `url` (klik op een link, terug). */
  onPageChange?: (url: string, title: string) => void;
  /** Hier hangt de view zijn terug/vooruit aan, voor de knoppen in de kopbalk. */
  navRef?: MutableRefObject<LiveBrowserNav | null>;
}

/** Een sessie die de server niet (meer) kent: herstart, niet blijven klagen. */
function sessieWeg(msg: string): boolean {
  return /\b404\b/.test(msg) && /session not found|expired/i.test(msg);
}

export default function LiveBrowserView({ url, mobile = false, onTitleChange, onSession, onPageChange, navRef }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Ophogen = een nieuwe sessie starten. */
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1280, h: 800 });

  // Waar de pagina volgens de browser NU staat. Komt de prop `url` daarmee
  // overeen (omdat wij hem net zelf naar boven gaven), dan niet opnieuw laden.
  const pageUrlRef = useRef<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const cbRef = useRef({ onTitleChange, onPageChange });
  cbRef.current = { onTitleChange, onPageChange };

  // ACTIES ACHTER ELKAAR. Klik, toetsen en scroll liepen los van elkaar; een
  // snel getypt woord kwam dan door elkaar aan, of een Enter vóór de laatste
  // letter. Eén rij houdt de volgorde die de gebruiker gaf.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn, fn);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const vw = mobile ? MOBILE_W : size.w;
  const vh = mobile ? MOBILE_H : size.h;

  const restart = useCallback(() => {
    pageUrlRef.current = null;
    setSessionId(null);
    setShot(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setError(null);
    setAttempt(a => a + 1);
  }, []);

  const fail = useCallback((e: unknown, fallback: string) => {
    const msg = e instanceof Error ? e.message : fallback;
    if (sessieWeg(msg)) { restart(); return; }
    setError(msg);
  }, [restart]);

  /** Wat de server over de pagina zegt, doorgeven aan de adresbalk. */
  const seen = useCallback((state: BrowserAgentPageState | null | undefined) => {
    if (!state?.url) return;
    pageUrlRef.current = state.url;
    cbRef.current.onTitleChange?.(state.title || state.url);
    if (state.url !== urlRef.current) cbRef.current.onPageChange?.(state.url, state.title || state.url);
  }, []);

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
      fail(e, 'screenshot failed');
    }
  }, [fail]);

  /** Een klik kan een pagina openen die pas na het antwoord laadt. */
  const followUp = useCallback((sid: string) => {
    for (const ms of [700, 2000]) {
      setTimeout(() => {
        void browserAgentState(sid).then(seen).catch(() => { /* oudere backend zonder /state */ });
      }, ms);
    }
  }, [seen]);

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

  // One session per mount (and per "Try again").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const { session_id } = await browserAgentStart();
        if (cancelled) return;
        setNotice(browserRouteNotice());
        setSessionId(session_id);
        onSession?.(session_id);
        if (mobile) await browserAgentViewport(session_id, MOBILE_W, MOBILE_H).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          setNotice(browserRouteNotice());
          setError(e instanceof Error ? e.message : 'could not start a browser session');
          setBusy(false);
        }
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
  }, [mobile, attempt]);

  // Navigate whenever the address changes — unless the page is already there
  // (we just reported that address upward ourselves).
  useEffect(() => {
    if (!sessionId || !url) return;
    if (url === pageUrlRef.current) { setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    void enqueue(async () => {
      try {
        const state = await browserAgentNavigate(sessionId, url);
        if (cancelled) return;
        seen(state);
        await refresh(sessionId);
      } catch (e) {
        if (!cancelled) fail(e, 'navigation failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
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

  // Terug/vooruit voor de kopbalk.
  useEffect(() => {
    if (!navRef) return;
    if (!sessionId) { navRef.current = null; return; }
    const stap = (richting: 'back' | 'forward') => enqueue(async () => {
      setBusy(true);
      try {
        const state = await browserAgentHistory(sessionId, richting);
        if (state.moved) seen(state);
        await refresh(sessionId);
        return state.moved;
      } finally {
        setBusy(false);
      }
    });
    navRef.current = { back: () => stap('back'), forward: () => stap('forward') };
    return () => { navRef.current = null; };
  }, [navRef, sessionId, enqueue, seen, refresh]);

  /** Screen point -> page point. See the note at the top of this file. */
  const toPage = (clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    // object-contain: the picture can be letterboxed inside the element box,
    // so map against the drawn image, not the box.
    const nw = el.naturalWidth || vw, nh = el.naturalHeight || vh;
    const scale = Math.min(r.width / nw, r.height / nh);
    const dw = nw * scale, dh = nh * scale;
    const ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
    const px = (clientX - ox) / dw, py = (clientY - oy) / dh;
    if (px < 0 || py < 0 || px > 1 || py > 1) return null;
    return { x: px * nw, y: py * nh };
  };

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId) return;
    e.currentTarget.focus();
    const p = toPage(e.clientX, e.clientY);
    if (!p) return;
    const sid = sessionId;
    void enqueue(async () => {
      try {
        seen(await browserAgentClick(sid, p));
        await refresh(sid);
        followUp(sid);
      } catch (err) {
        fail(err, 'click failed');
      }
    });
  };

  // TYPEN WORDT GEBUNDELD. Eén API-aanroep per letter met een screenshot erachter
  // maakte een zoekterm traag en liet letters inhalen. Letters gaan nu samen
  // als één `type`; een speciale toets (Enter, Backspace) sluit de bundel eerst af.
  const typeBuf = useRef('');
  const typeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushTyping = useCallback((sid: string) => {
    clearTimeout(typeTimer.current);
    const text = typeBuf.current;
    typeBuf.current = '';
    if (!text) return;
    void enqueue(async () => {
      try {
        await browserAgentType(sid, text);
        await refresh(sid);
      } catch (err) {
        fail(err, 'typing failed');
      }
    });
  }, [enqueue, refresh, fail]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sessionId) return;
    const sid = sessionId;
    const mod = e.metaKey || e.ctrlKey;
    // Cmd/Ctrl+A selecteert alles in het veld; andere sneltoetsen (Cmd+R,
    // Cmd+W …) horen bij de app, niet bij de pagina.
    if (mod && e.key.toLowerCase() !== 'a') return;
    e.preventDefault();
    const isChar = e.key.length === 1 && !mod && !e.altKey;
    if (isChar) {
      typeBuf.current += e.key;
      clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(() => flushTyping(sid), TYPE_FLUSH_MS);
      return;
    }
    if (['Shift', 'Meta', 'Control', 'Alt', 'CapsLock'].includes(e.key)) return;
    flushTyping(sid);
    const key = mod ? 'Control+a' : e.key;
    void enqueue(async () => {
      try {
        seen(await browserAgentPress(sid, key));
        await refresh(sid);
        if (key === 'Enter') followUp(sid);
      } catch (err) {
        fail(err, 'key failed');
      }
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!sessionId) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    typeBuf.current += text;
    flushTyping(sessionId);
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
    const sid = sessionId;
    pendingScroll.current += e.deltaY;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const dy = pendingScroll.current;
      pendingScroll.current = 0;
      if (!dy) return;
      void enqueue(() => browserAgentScroll(sid, dy).then(() => refresh(sid)))
        .catch(() => { /* a dropped scroll is not worth an error banner */ });
    }, 90);
  };

  const startFailed = !shot && !busy && !!error;

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
          onPaste={onPaste}
          onWheel={onWheel}
          // Preserve aspect ratio on BOTH desktop and mobile. Desktop still
          // asks Chromium for the pane's measured viewport, so it normally
          // fills exactly; during resize/debounce or an older screenshot we
          // letterbox briefly instead of visibly stretching the website.
          // Mobile keeps a real phone viewport and is fitted.
          className={mobile
            ? 'max-w-full max-h-full object-contain cursor-pointer outline-none'
            : 'w-full h-full object-contain cursor-pointer outline-none'}
          draggable={false}
        />
      ) : startFailed ? (
        <div className="flex flex-col items-center gap-3 max-w-md px-6 text-center">
          <AlertTriangle size={20} className="text-red-300" />
          <p className="text-[12px] text-white/80">The browser could not start.</p>
          <p className="text-[11px] text-white/50 break-words">{error}</p>
          <button
            type="button"
            onClick={restart}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-white/80 hover:text-white"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <RotateCw size={12} /> Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/40">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-[11px]">{sessionId ? 'Loading the page…' : 'Starting a real browser…'}</p>
        </div>
      )}

      {notice && (
        <div className="absolute top-2 left-2 right-12 flex items-center gap-2 rounded-lg bg-black/75 px-3 py-1.5">
          <Info size={12} className="text-amber-300 shrink-0" />
          <p className="text-[11px] text-amber-100/90 flex-1 truncate" title={notice}>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="text-[11px] text-white/50 hover:text-white">×</button>
        </div>
      )}

      {busy && shot && (
        <div className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5">
          <Loader2 size={12} className="animate-spin text-white/70" />
        </div>
      )}

      {error && !startFailed && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2">
          <AlertTriangle size={13} className="text-red-300 shrink-0" />
          <p className="text-[11px] text-red-200 flex-1 truncate" title={error}>{error}</p>
          <button
            type="button"
            title={sessionId ? 'Refresh' : 'Start a new browser session'}
            onClick={() => (sessionId ? void refresh(sessionId) : restart())}
            className="text-[11px] text-red-200 hover:text-white"
          >
            <RotateCw size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
