/**
 * The in-app terminal's WebSocket URL.
 *
 * The terminal server runs on the VPS (nginx proxies /terminal -> :4022),
 * NOT on the Vercel-hosted frontend host — and Vercel can't proxy WebSockets
 * anyway. So in production we must point straight at the VPS; using
 * window.location.host (www.axeheadquarters.com) is why the terminal showed
 * "Connection failed". Dev stays same-origin (vite proxy). Override both with
 * VITE_TERMINAL_WS_URL if your VPS lives elsewhere.
 */
const VPS_TERMINAL_WS = 'wss://api.axecompanion.com/terminal';

export function buildTerminalWsUrl(token: string): string {
  const override = import.meta.env.VITE_TERMINAL_WS_URL as string | undefined;
  const base = override
    ? override
    : import.meta.env.DEV
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/terminal/ws`
      : VPS_TERMINAL_WS;
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}
