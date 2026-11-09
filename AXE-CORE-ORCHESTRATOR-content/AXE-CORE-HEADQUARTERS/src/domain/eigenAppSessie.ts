/**
 * Auth voor Luka's eigen apps in de rechter radiale shell.
 *
 * De radial opent Trading OS, Companion en AXON als een Tauri-WebviewWindow
 * op hun eigen site. Dat is een verse WKWebView: geen Safari-cookies, geen
 * Core-localStorage, en Google-OAuth (`signInWithGoogle` in de AXON-bundel)
 * faalt daar. De telefoon had dit al opgelost voor AXON (first-party login
 * + hash die supabase-js herkent). De radial deed dat niet, en opende
 * Companion bovendien op de www-homepagina in plaats van /chat.
 *
 * Dit bestand weet WELKE sessie bij WELKE app hoort, en hoe de URL eruit
 * ziet. Het plakt geen tokens in logs. Service-role komt hier niet in.
 */
import type { EigenApp, EigenAppId } from './eigenApps';

/** Gedeeld project: Core, Companion, Trading OS. Publieke ref, geen geheim. */
export const KERN_SUPABASE_REF = 'pqnngpcgbdwxavbatbia';
/** AXON's eigen project. Nooit een Core-token hierin, nooit andersom. */
export const AXON_SUPABASE_REF = 'ktaditgtbubonrahyiig';

export type SessieBron = 'kern' | 'axon';

export interface ShellTokens {
  access_token: string;
  refresh_token: string;
  /** Unix-seconden, zoals supabase-js `expires_at`. */
  expires_at: number;
}

export interface ShellSessie {
  bron: SessieBron;
  tokens: ShellTokens;
}

/**
 * WKWebView zet anders "Tauri" in de UA. Google weigert OAuth in embedded
 * webviews, en Cloudflare-challenges (tradingosapp.com, `cf-mitigated:
 * challenge`) gedragen zich daar ook anders dan in Safari. Zelfde WebKit,
 * Safari-UA.
 */
export const WKWEBVIEW_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

export function sessieBronVan(app: EigenApp): SessieBron | null {
  if (app.pagina) return null;
  if (app.id === 'axon') return 'axon';
  if (app.id === 'companion' || app.id === 'trading-os') return 'kern';
  return null;
}

export function supabaseRefVan(bron: SessieBron): string {
  return bron === 'axon' ? AXON_SUPABASE_REF : KERN_SUPABASE_REF;
}

/**
 * Companion's /chat 307't naar /login zolang de server geen cookie ziet.
 * Een hash overleeft die redirect niet, en supabase-js leest de hash alleen
 * op de pagina die daadwerkelijk start. Dus: de login-pagina, apex-host
 * (niet www), gelijk aan ProductEmbed's site minus het redirect-verlies.
 *
 * Trading OS: de apex is een marketingpagina; de auth-client zit op /login
 * (gemeten: /login bestaat, homepage is de landingspagina).
 */
export function shellBasisUrl(app: EigenApp, liveUrl: string): string {
  if (app.id === 'companion') return 'https://axecompanion.com/login';
  if (app.id === 'trading-os') {
    try {
      const u = new URL(liveUrl);
      return `${u.origin}/login`;
    } catch {
      return 'https://tradingosapp.com/login';
    }
  }
  if (app.id === 'axon') {
    const basis = liveUrl.trim() || 'https://app.axon-memory.com/';
    return basis.endsWith('/') ? basis : `${basis}/`;
  }
  return liveUrl;
}

/** Hash die supabase-js `detectSessionInUrl` herkent. `nuMs` is Date.now, hier buiten zodat tests vaststaan. */
function sessieHash(tokens: ShellTokens, nuMs: number, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: String(Math.max(60, tokens.expires_at - Math.floor(nuMs / 1000))),
    token_type: 'bearer',
    ...extra,
  });
  return q.toString();
}

export function urlMetSessie(
  basis: string,
  tokens: ShellTokens | null,
  nuMs: number,
  extra: Record<string, string> = {},
): string {
  if (!tokens?.access_token || !tokens.refresh_token) return basis;
  const wortel = basis.includes('#') ? basis.slice(0, basis.indexOf('#')) : basis;
  return `${wortel}#${sessieHash(tokens, nuMs, extra)}`;
}

/**
 * URL voor de shell. Verkeerde project-sessie wordt geweigerd: een AXON-token
 * hoort nooit op Companion, een Core-token nooit op AXON.
 *
 * AXON houdt `type=recovery` (zo herkent hun bundel de hash, zie axonSessie).
 * Kern-apps niet: recovery opent daar het wachtwoord-vergeten-scherm.
 */
export function shellUrl(
  app: EigenApp,
  liveUrl: string,
  sessie: ShellSessie | null,
  nuMs: number,
): string {
  const basis = shellBasisUrl(app, liveUrl);
  const bron = sessieBronVan(app);
  if (!sessie || !bron || sessie.bron !== bron) return basis;
  const extra: Record<string, string> = bron === 'axon' ? { type: 'recovery' } : {};
  return urlMetSessie(basis, sessie.tokens, nuMs, extra);
}

/** Voor logs en fouten: nooit de hash meenemen. */
export function urlZonderGeheim(url: string): string {
  const i = url.indexOf('#');
  return i < 0 ? url : url.slice(0, i);
}

/**
 * Vaste 16 bytes per app-id, zodat close→reopen dezelfde WKWebsiteDataStore
 * treft (macOS 14+). Verschillende apps krijgen verschillende stores, zodat
 * Companion-cookies niet in AXON belanden.
 */
export function dataStoreIdentifierVoor(id: EigenAppId): number[] {
  const ns = [0xa1, 0xe0, 0x52, 0x41, 0x44, 0x49, 0x41, 0x4c, 0x41, 0x50, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00];
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return ns.map((b, i) => (b ^ ((h >>> ((i % 4) * 8)) & 0xff)) & 0xff);
}

export interface RemoteWebviewOpties {
  userAgent: string;
  incognito: false;
  dataStoreIdentifier: number[];
}

/** Alleen voor een remote site. Lokale AXE-pagina's delen Core's store — anders is Luka daar ineens uitgelogd. */
export function shellWebviewOpties(app: EigenApp): RemoteWebviewOpties | Record<string, never> {
  if (app.pagina) return {};
  return {
    userAgent: WKWEBVIEW_SAFARI_UA,
    incognito: false,
    dataStoreIdentifier: dataStoreIdentifierVoor(app.id),
  };
}
