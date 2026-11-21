/**
 * Auth-grenzen voor Luka's eigen apps in de rechter radiale shell.
 *
 * De radial opent Trading OS, Companion en AXON als een Tauri-WebviewWindow
 * op hun eigen HTTPS-origin. Dat is een verse WKWebView: geen Safari-cookies.
 * Een eerdere poging plakte access/refresh-tokens in de navigatie-hash. Dat
 * is onveilig én ongeldig bij de echte clients: Companion's live bundle is
 * `@supabase/ssr` `createBrowserClient` met `flowType: "pkce"` (implicit
 * hash wordt geweigerd en niet gewist), AXON opent `type=recovery` als
 * wachtwoord-reset, en `registered_apps.prod_url` is geen allowlist.
 *
 * Hier staat daarom alleen: welk origin, welk project, welke WKWebView-store.
 * Geen tokens in URL, history of window.open. Cross-app restore vereist werk
 * in de bestemming (PKCE op dát origin). Service-role komt hier niet in.
 */
import type { EigenApp, EigenAppId } from './eigenApps';

/** Gedeeld project: Core, Companion, Trading OS. Publieke ref, geen geheim. */
export const KERN_SUPABASE_REF = 'pqnngpcgbdwxavbatbia';
/** AXON's eigen project. Nooit een Core-token hierin, nooit andersom. */
export const AXON_SUPABASE_REF = 'ktaditgtbubonrahyiig';

export type SessieBron = 'kern' | 'axon';

export type RemoteShellId = 'trading-os' | 'companion' | 'axon';

export const SHELL_VERTROUWEN: Record<RemoteShellId, { url: string; origin: string; project: string }> = {
  companion: {
    url: 'https://axecompanion.com/chat',
    origin: 'https://axecompanion.com',
    project: KERN_SUPABASE_REF,
  },
  'trading-os': {
    url: 'https://tradingosapp.com/',
    origin: 'https://tradingosapp.com',
    project: KERN_SUPABASE_REF,
  },
  axon: {
    url: 'https://app.axon-memory.com/',
    origin: 'https://app.axon-memory.com',
    project: AXON_SUPABASE_REF,
  },
};

/**
 * WKWebView zet anders "Tauri" in de UA. Google weigert OAuth in embedded
 * webviews, en Cloudflare-challenges (tradingosapp.com, `cf-mitigated:
 * challenge`) gedragen zich daar ook anders dan in Safari. Zelfde WebKit,
 * Safari-UA — geen sessie erin smokkelen.
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

function isRemoteShellId(id: EigenAppId): id is RemoteShellId {
  return id === 'companion' || id === 'trading-os' || id === 'axon';
}

/**
 * Fail-closed: alleen de vastgelegde HTTPS-URL. `liveUrl` (registered_apps)
 * mag nooit de bestemming kiezen — www is marketing, een vijandige prod_url
 * zou anders Core-tokens of de sessiecookie-jar naar een ander origin leiden.
 */
export function shellUrl(app: EigenApp, liveUrl?: string): string | null {
  void liveUrl;
  if (!isRemoteShellId(app.id) || app.pagina) return null;
  return SHELL_VERTROUWEN[app.id].url;
}

const GEHEIME_QUERY = /^(access_token|refresh_token|id_token|token|token_type|code|password|secret|type|expires_in|expires_at|provider_token|provider_refresh_token)$/i;

/** Voor logs en fouten: nooit hash of auth-query meenemen. */
export function urlZonderGeheim(url: string): string {
  const zonderHash = url.includes('#') ? url.slice(0, url.indexOf('#')) : url;
  try {
    const u = new URL(zonderHash);
    for (const key of [...u.searchParams.keys()]) {
      if (GEHEIME_QUERY.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    const vraag = zonderHash.indexOf('?');
    return vraag < 0 ? zonderHash : zonderHash.slice(0, vraag);
  }
}

export function shellFoutTekst(appId: string, payload: unknown): string {
  return `shell ${appId}: ${urlZonderGeheim(String(payload))}`;
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
