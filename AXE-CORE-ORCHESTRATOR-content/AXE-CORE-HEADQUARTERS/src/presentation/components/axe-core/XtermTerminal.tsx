/**
 * XtermTerminal.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Full xterm.js terminal component connected to the API server's real-shell
 * WebSocket (/api/terminal/ws).
 *
 * Features:
 *   - Full ANSI / 256-colour rendering via xterm.js
 *   - Local line editor (echo, backspace, history, Ctrl+C/L)
 *   - Auto-fit on container resize (ResizeObserver)
 *   - Clickable URLs (WebLinksAddon)
 *   - Forward-ref handle: send(), clear(), reconnect(), isConnected()
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
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
}

/* ─── WS URL helper (shared with useRealTerminal) ───────────────────────── */
const buildWsUrl = buildTerminalWsUrl;

/* ─── Component ─────────────────────────────────────────────────────────── */
export const XtermTerminal = forwardRef<XtermHandle, Props>(function XtermTerminal(
  { style, className, onConnectionChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const fitRef       = useRef<FitAddon | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const connRef      = useRef(false);

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
    const ws = new WebSocket(buildWsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      connRef.current = true;
      onConnectionChange?.(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; data: unknown };
        if (msg.type === 'output') termRef.current?.write(msg.data as string);
        else if (msg.type === 'exit') {
          termRef.current?.write(`\r\n\x1b[33m[Process exited (code ${String(msg.data)})]\x1b[0m\r\n`);
        }
      } catch { /* ignore malformed */ }
    };
    ws.onclose = () => {
      connRef.current = false;
      onConnectionChange?.(false);
      termRef.current?.write('\r\n\x1b[33m[Terminal disconnected — click Reconnect]\x1b[0m\r\n');
    };
    ws.onerror = () => {
      connRef.current = false;
      onConnectionChange?.(false);
      termRef.current?.write('\r\n\x1b[31m[Connection failed]\x1b[0m\r\n');
    };
  };

  /* ── Imperative handle ───────────────────────────────────────────────── */
  useImperativeHandle(ref, () => ({
    send: (text: string) => {
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
        background:          '#02080a',
        foreground:          '#a5f3fc',
        cursor:              '#22d3ee',
        cursorAccent:        '#000000',
        selectionBackground: 'rgba(34,211,238,0.25)',
        black:         '#000000', red:          '#ef4444',
        green:         '#10b981', yellow:       '#f59e0b',
        blue:          '#3b82f6', magenta:      '#8b5cf6',
        cyan:          '#22d3ee', white:        '#e5e7eb',
        brightBlack:   '#6b7280', brightRed:    '#f87171',
        brightGreen:   '#34d399', brightYellow: '#fcd34d',
        brightBlue:    '#60a5fa', brightMagenta:'#a78bfa',
        brightCyan:    '#67e8f9', brightWhite:  '#ffffff',
      },
      fontFamily:  '"JetBrains Mono","Fira Code","Cascadia Code","Courier New",monospace',
      fontSize:     13,
      lineHeight:   1.5,
      cursorBlink:  true,
      cursorStyle: 'block',
      scrollback:   5000,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    try { fitAddon.fit(); } catch { /* might fail if not visible yet */ }

    termRef.current = term;
    fitRef.current  = fitAddon;

    /* ── Local line editor ─────────────────────────────────────────────── */
    term.onData((data) => {
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

    /* ── Auto-fit on container resize ──────────────────────────────────── */
    const ro = new ResizeObserver(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
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
