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

/**
 * @param token  de Supabase-sessietoken; de server controleert hem.
 * @param wsBasis een expliciet adres, bijvoorbeeld van een gekozen host in de
 *   Terminals-tab. Zonder dit blijft het oude gedrag: de VPS, of de override.
 *   Meegegeven adres wint van de override -- anders zou een ingestelde
 *   VITE_TERMINAL_WS_URL de hostkiezer stilletjes negeren, en dan klik je op
 *   "Deze Mac" en land je op de VPS.
 */
export function buildTerminalWsUrl(token: string, wsBasis?: string): string {
  const override = import.meta.env.VITE_TERMINAL_WS_URL as string | undefined;
  const base = wsBasis
    ? wsBasis
    : override
    ? override
    : import.meta.env.DEV
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/terminal/ws`
      : VPS_TERMINAL_WS;
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}
