import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { buildTerminalWsUrl } from '@/infrastructure/config/terminalWsUrl';
import { bereikbaarHier, hostSoort, waaromGeenVerbinding } from '@/domain/terminalHosts';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/**
 * Shared client for AXE Core's real terminal WebSocket (VPS terminal-server on
 * :4022, proxied by nginx at /terminal). Used by both the full Terminal tab
 * and the compact terminal panel embedded in the Code Editor, so there's a
 * single real implementation instead of one real + one simulated terminal.
 */
const buildTerminalUrl = buildTerminalWsUrl;

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

    const url = buildTerminalUrl(token);
    let endpoint = url;
    try { const u = new URL(url); endpoint = `${u.protocol}//${u.host}${u.pathname}`; } catch { /* keep raw */ }
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let everOpen = false;

    ws.onopen = () => { everOpen = true; setConnected(true); };
    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        if (type === 'output') append(data);
        else if (type === 'exit') { append(`\r\n[Process ended (code ${data})]\r\n`); setConnected(false); }
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = (e) => {
      setConnected(false);
      // Only report a hard failure if we never connected — otherwise it's a
      // normal disconnect. Surface the endpoint so it's clear which host failed.
      if (!everOpen) {
        // Wat je moet nakijken hangt af van WELKE machine dit is. Hier stond
        // één regel over de VPS, ook voor `127.0.0.1` (dat op de telefoon de
        // telefoon zelf is) en voor een Mac achter Tailscale -- dan zoek je op
        // de verkeerde machine. Zie domain/terminalHosts.ts.
        const soort = hostSoort(url);
        const raad = waaromGeenVerbinding(
          soort,
          bereikbaarHier(soort, { tauri: isTauriRuntime(), paginaHost: location.hostname }),
        );
        setOutput(
          `[Could not connect to terminal server] (code ${e.code || 1006})\r\n` +
          `Tried: ${endpoint}\r\n` +
          `${raad}\r\n`,
        );
      }
    };
    ws.onerror = () => { setConnected(false); /* detail handled in onclose */ };
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
