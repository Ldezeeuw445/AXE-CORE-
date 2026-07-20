import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

/**
 * Shared client for AXE Core's real terminal WebSocket (see
 * artifacts/api-server/src/terminal.ts). Used by both the full Terminal tab
 * and the compact terminal panel embedded in the Code Editor, so there's a
 * single real implementation instead of one real + one simulated terminal.
 */
function buildTerminalUrl(token: string): string {
  const override = import.meta.env.VITE_TERMINAL_WS_URL;
  if (override) return `${override}${override.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/terminal/ws?token=${encodeURIComponent(token)}`;
}

export function useRealTerminal(initialMessage = '') {
  const [output, setOutput] = useState(initialMessage);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const append = useCallback((text: string) => {
    setOutput(prev => {
      const next = prev + text;
      return next.length > 100_000 ? next.slice(next.length - 80_000) : next;
    });
  }, []);

  const connect = useCallback(async () => {
    try { wsRef.current?.close(); } catch { /* ignore */ }

    const sb = getSupabase();
    // In dev, proceed with a placeholder token — the server skips auth for NODE_ENV≠production
    const token = (await sb?.auth.getSession())?.data.session?.access_token ?? 'dev';

    const ws = new WebSocket(buildTerminalUrl(token));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        if (type === 'output') append(data);
        else if (type === 'exit') { append(`\r\n[Process ended (code ${data})]\r\n`); setConnected(false); }
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => { setConnected(false); setOutput('[Could not connect to terminal server]\r\n'); };
  }, [append]);

  useEffect(() => {
    void connect();
    return () => { try { wsRef.current?.close(); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: text }));
    }
  }, []);

  const clear = useCallback(() => setOutput(''), []);

  return { output, connected, send, clear, reconnect: connect };
}
