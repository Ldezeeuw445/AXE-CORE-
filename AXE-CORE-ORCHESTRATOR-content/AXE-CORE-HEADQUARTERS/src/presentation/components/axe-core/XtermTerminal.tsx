/**
 * XtermTerminal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Full xterm.js terminal component connected to the API server's real-shell
 * WebSocket (/api/terminal/ws).
 *
 * Features:
 *   - Full ANSI / 256-colour rendering via xterm.js, op de GPU (WebglAddon)
 *   - Rauwe doorgifte naar een echte terminal; de regeleditor hieronder is
 *     alleen de terugval voor een server zonder pty (zie terminalShell.cjs)
 *   - Auto-fit on container resize (ResizeObserver, één keer per frame)
 *   - Clickable URLs (WebLinksAddon)
 *   - Forward-ref handle: send(), clear(), reconnect(), isConnected()
 *
 * ## De regeleditor hieronder is een terugval, geen ontwerp
 *
 * Er staat een complete regeleditor in dit bestand: eigen echo, backspace,
 * geschiedenis met de pijltjes, Ctrl+C, Ctrl+L. Die is er omdat de server de
 * shell op drie pijpen startte, zonder terminal, en zo'n shell schrijft zelf
 * niets terug -- ook geen prompt.
 *
 * Sinds de server een pty geeft doet de regeldiscipline aan de andere kant dat
 * werk, en beter: tab-aanvulling, Ctrl+R, echte SIGINT, en programma's die het
 * scherm overnemen. Bij een pty gaat alles hier dus rauw doorheen.
 *
 * De editor blijft staan voor een server die nog niet is bijgewerkt (de VPS,
 * bijvoorbeeld). Weghalen zou die verbinding onbruikbaar maken zonder dat
 * iets zegt waarom.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { buildTerminalWsUrl } from '@/infrastructure/config/terminalWsUrl';

/* ─── Public API ────────────────────────────────────────────────────────── */
export interface XtermHandle {
  /** Send a text string (or full command + '\n') to the shell. */
  send: (text: string) => void;
  /** Soft-clear the visible viewport (history stays in scrollback). */
  clear: () => void;
  /** Open a fresh WebSocket session (new shell). */
  reconnect: () => void;
  /** Current connection state. */
  isConnected: () => boolean;
}

interface Props {
  style?: React.CSSProperties;
  className?: string;
  onConnectionChange?: (connected: boolean) => void;
  /** Het adres van de gekozen machine. Weggelaten = de VPS, zoals altijd. */
  wsBasis?: string;
}

/* ─── WS URL helper (shared with useRealTerminal) ───────────────────────── */
const buildWsUrl = buildTerminalWsUrl;

/* ─── Component ─────────────────────────────────────────────────────────── */
export const XtermTerminal = forwardRef<XtermHandle, Props>(function XtermTerminal(
  { style, className, onConnectionChange, wsBasis },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const connRef      = useRef(false);
  /* Draait er een echte terminal aan de andere kant? Dat bepaalt of de
     browser zelf moet echoën. Zie het 'ready'-bericht hieronder. */
  const ptyRef       = useRef(false);

  /* ── Local line-editor state (mutable, no re-render needed) ─────────── */
  const lineRef    = useRef('');
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);

  /* ── Send raw text to the WS ─────────────────────────────────────────── */
  function rawSend(text: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: text }));
    }
  }

  /* ── Open WebSocket ──────────────────────────────────────────────────── */
  const connect = async () => {
    try { wsRef.current?.close(); } catch { /* ignore */ }
    const sb = getSupabase();
    const token = (await sb?.auth.getSession())?.data.session?.access_token ?? 'dev';
    const url = buildWsUrl(token, wsBasis);
    // The endpoint the browser is actually dialing (token stripped) — printed
    // on failure so it's obvious whether we're hitting the VPS or, wrongly,
    // the Vercel host. A bare "[Connection failed]" told nobody anything.
    let endpoint = url;
    try { const u = new URL(url); endpoint = `${u.protocol}//${u.host}${u.pathname}`; } catch { /* keep raw */ }
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let everOpen = false;

    ws.onopen = () => {
      everOpen = true;
      connRef.current = true;
      onConnectionChange?.(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data: unknown };
        if (msg.type === 'output') termRef.current?.write(msg.data as string);
        else if (msg.type === 'ready') {
          // De server zegt of hij een pty gaf. Zo ja, dan echoot de terminal
          // aan de andere kant zelf en moet de regeleditor hier UIT -- anders
          // staat elke letter er dubbel. Daarom komt dit van de server en is
          // het geen aanname aan deze kant.
          ptyRef.current = Boolean((msg.data as { pty?: boolean } | null)?.pty);
          const t = termRef.current;
          if (ptyRef.current && t) {
            // De pty van `script` begint op 80x24. Deze maat is wat hier
            // werkelijk past; zonder dit breekt `less` af op tachtig tekens.
            try { wsRef.current?.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows })); }
            catch { /* de socket ging net dicht */ }
          }
        }
        else if (msg.type === 'exit') {
          termRef.current?.write(`\r\n\x1b[33m[Process exited (code ${String(msg.data)})]\x1b[0m\r\n`);
        }
      } catch { /* ignore malformed */ }
    };
    ws.onclose = (e) => {
      connRef.current = false;
      onConnectionChange?.(false);
      if (everOpen) {
        termRef.current?.write('\r\n\x1b[33m[Terminal disconnected — click Reconnect]\x1b[0m\r\n');
      } else {
        // Never opened → the handshake was refused (nginx /terminal missing,
        // axe-terminal service down, cert, or wrong host). Browsers hide the
        // HTTP status behind close code 1006, so we surface the endpoint and a
        // hint instead of a blank failure.
        termRef.current?.write(
          `\r\n\x1b[31m[Connection failed]\x1b[0m \x1b[90m(code ${e.code || 1006})\x1b[0m\r\n` +
          `\x1b[90mTried: ${endpoint}\r\n` +
          `Check on the VPS: systemctl status axe-terminal · ss -tlnp | grep 4022 · nginx has the /terminal block.\x1b[0m\r\n`,
        );
      }
    };
    ws.onerror = () => {
      connRef.current = false;
      onConnectionChange?.(false);
      // Detail is written by onclose (fires right after) so we don't double-log.
    };
  };

  /* ── Imperative handle ───────────────────────────────────────────────── */
  useImperativeHandle(ref, () => ({
    send: (text: string) => {
      // Met een pty schrijft de terminal aan de andere kant het commando zelf
      // terug. Hier ook echoën geeft elk ingeplakt commando twee keer.
      if (ptyRef.current) { rawSend(text); return; }

      const term = termRef.current;
      // Erase any partial user input on the line first
      if (term && lineRef.current.length > 0) {
        term.write('\b \b'.repeat(lineRef.current.length));
        lineRef.current = '';
        histIdxRef.current = -1;
      }
      // Echo the injected command so the user sees it
      term?.write(text.replace(/\n/g, '\r\n'));
      rawSend(text);
    },
    clear: () => {
      termRef.current?.clear();
    },
    reconnect: () => { void connect(); },
    isConnected: () => connRef.current,
  }));

  /* ── xterm setup (runs once) ─────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        /* ALTIJD doorzichtig. Het vlak eromheen levert de vulling.
         *
         * Hier stond een voorwaarde op data-look, met `#02080a` als terugval.
         * Twee dingen gingen daar mis. De stand wordt één keer gelezen, bij het
         * opzetten van de terminal -- staat data-look dan nog niet op <html>
         * (het wordt na de eerste render gezet), dan krijgt hij dat blauwzwart
         * en houdt het, ook als de plaat er allang is. En wisselen van stand
         * verandert er daarna niets meer aan.
         *
         * Dat is het zwarte vlak IN de kaart: een bijna-zwart met een blauwe
         * zweem op een matzwarte kaart. Nu is er geen tweede vlak meer om uit
         * de pas te lopen. */
        background:          '#00000000',
        /* Neutraal lichtgrijs en niet cyaan.
         *
         * Het stond op #a5f3fc: alle gewone uitvoer had een blauwe zweem. Dat
         * las als "AXE-scherm" in plaats van als een terminal, en het vecht met
         * de cyane accenten die wél iets betekenen -- als álles cyaan is, zegt
         * cyaan niets meer. De kleuren die het werk doen (groen voor gelukt,
         * geel voor let op, rood voor stuk) staan hieronder en blijven. */
        foreground:          '#C9CDD6',
        cursor:              'var(--accent-cyan)',
        cursorAccent:        'var(--bg-base)',
        selectionBackground: 'var(--tint-hi)',
        black:         'var(--bg-base)', red:          'var(--error)',
        green:         'var(--success)', yellow:       'var(--warning)',
        blue:          '#3b82f6', magenta:      '#8b5cf6',
        cyan:          'var(--accent-cyan)', white:        '#e5e7eb',
        brightBlack:   '#6b7280', brightRed:    'var(--error)',
        brightGreen:   'var(--success)', brightYellow: '#fcd34d',
        brightBlue:    '#60a5fa', brightMagenta:'#a78bfa',
        brightCyan:    '#67e8f9', brightWhite:  '#ffffff',
      },
      fontFamily:  '"JetBrains Mono","Fira Code","Cascadia Code","Courier New",monospace',
      fontSize:     13,
      lineHeight:   1.5,
      /* Uit tot dit vak de aandacht heeft.
         Een knipperende cursor is een herteken, twee keer per seconde, voor
         altijd. Bij één terminal merk je dat niet; acht vakken naast elkaar
         zijn zestien hertekeningen per seconde in vensters waar je niet eens
         naar kijkt. Hij gaat aan bij focus (zie hieronder), en dat is precies
         het vak waar een cursor iets betekent. */
      cursorBlink:  false,
      cursorStyle: 'block',
      /* 5000 regels maal acht vakken is een half miljoen regels in het
         geheugen. Tweeduizend is nog altijd ver terugscrollen, en het scheelt
         bij elk venster dat je niet gebruikt. */
      scrollback:   2000,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    /* ── Tekenen op de GPU ───────────────────────────────────────────────
       Zonder deze addon tekent xterm elke cel als DOM-element. Dat is de
       langzaamste stand die er is, en bij acht terminals naast elkaar is het
       het verschil tussen een terminal en een diavoorstelling: één scherm vol
       uitvoer is dan duizenden knopen die de browser moet opmaken.

       In een try, en met een terugval, want WebGL kan geweigerd worden (geen
       hardwareversnelling, een driver die de browser op een zwarte lijst zet).
       Dan is de DOM-renderer traag maar juist -- en dat is beter dan een leeg
       vak. `onContextLoss` is niet optioneel: raakt de GPU-context kwijt en
       niemand ruimt op, dan blijft er een terminal staan die nooit meer iets
       tekent.

       Acht vakken is ook acht WebGL-contexten. Browsers houden er zo'n zestien
       aan; we zitten eronder, maar niet zó ruim dat context-verlies theorie is
       -- vandaar dat de terugval hierboven echt werkt en niet alleen netjes
       staat. */
    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        try { webgl?.dispose(); } catch { /* al weg */ }
        webgl = null;
      });
      term.loadAddon(webgl);
    } catch {
      webgl = null;
    }

    try { fitAddon.fit(); } catch { /* might fail if not visible yet */ }

    termRef.current = term;
    fitRef.current  = fitAddon;

    /* ── Local line editor ─────────────────────────────────────────────── */
    term.onData((data) => {
      /* ── Echte terminal: alles rauw doorsturen ────────────────────────
         Geen eigen echo, geen eigen backspace, geen eigen geschiedenis. Die
         drie waren er omdat de shell op pijpen draaide en zelf niets
         terugschreef; met een pty doet de regeldiscipline aan de andere kant
         het beter dan dit ooit kon -- inclusief tab-aanvulling, Ctrl+R,
         Ctrl+C, en programma's als less en top die het scherm overnemen.

         Dit is ook de snellere weg: geen stringwerk per toetsaanslag, en geen
         term.write() per letter die een herteken uitlokt. */
      if (ptyRef.current) { rawSend(data); return; }

      if (data === '\r' || data === '\n') {
        // ↵ Enter — submit line
        const line = lineRef.current;
        term.write('\r\n');
        if (line.trim()) {
          historyRef.current.unshift(line);
          if (historyRef.current.length > 300) historyRef.current.pop();
        }
        lineRef.current  = '';
        histIdxRef.current = -1;
        rawSend(line + '\n');

      } else if (data === '\x7f' || data === '\x08') {
        // ⌫ Backspace
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write('\b \b');
        }

      } else if (data === '\x03') {
        // Ctrl+C — interrupt
        term.write('^C\r\n');
        lineRef.current  = '';
        histIdxRef.current = -1;
        rawSend('\x03');

      } else if (data === '\x0c') {
        // Ctrl+L — clear screen
        term.clear();

      } else if (data === '\x1b[A') {
        // ↑ Arrow — history prev
        if (histIdxRef.current < historyRef.current.length - 1) {
          term.write('\b \b'.repeat(lineRef.current.length));
          histIdxRef.current++;
          lineRef.current = historyRef.current[histIdxRef.current] ?? '';
          term.write(lineRef.current);
        }

      } else if (data === '\x1b[B') {
        // ↓ Arrow — history next
        term.write('\b \b'.repeat(lineRef.current.length));
        histIdxRef.current--;
        if (histIdxRef.current < 0) {
          histIdxRef.current = -1;
          lineRef.current = '';
        } else {
          lineRef.current = historyRef.current[histIdxRef.current] ?? '';
        }
        term.write(lineRef.current);

      } else if (!data.startsWith('\x1b')) {
        // Printable text (including paste)
        lineRef.current += data;
        term.write(data);
      }
      // Other escape sequences (Ctrl+arrows, F-keys, etc.) — ignore silently
    });

    /* ── Connect WS ────────────────────────────────────────────────────── */
    void connect();

    /* ── Auto-fit on container resize ────────────────────────────────────
       Eén keer per frame, niet één keer per melding. fit() meet de container
       op en zet daarna de maat -- lezen en schrijven door elkaar. Bij het
       slepen van het venster kwamen die meldingen in bosjes binnen, maal acht
       terminals, en elke fit dwong de browser tot een nieuwe layout. Dat is de
       schokkerigheid tijdens het verslepen.

       requestAnimationFrame maakt er precies één van per beeld, en die valt
       ook nog op het moment dat de browser tóch gaat tekenen. */
    let gepland = 0;
    const ro = new ResizeObserver(() => {
      if (gepland) return;
      gepland = requestAnimationFrame(() => {
        gepland = 0;
        try { fitRef.current?.fit(); } catch { /* ignore */ }
      });
    });
    ro.observe(containerRef.current);

    /* De cursor knippert alleen in het vak waar je werkt. Zie de uitleg bij
       cursorBlink hierboven. */
    const aan  = () => { try { term.options.cursorBlink = true; } catch { /* weg */ } };
    const uit  = () => { try { term.options.cursorBlink = false; } catch { /* weg */ } };
    term.textarea?.addEventListener('focus', aan);
    term.textarea?.addEventListener('blur', uit);

    return () => {
      ro.disconnect();
      if (gepland) cancelAnimationFrame(gepland);
      term.textarea?.removeEventListener('focus', aan);
      term.textarea?.removeEventListener('blur', uit);
      try { webgl?.dispose(); } catch { /* al weg */ }
      term.dispose();
      try { wsRef.current?.close(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
});
