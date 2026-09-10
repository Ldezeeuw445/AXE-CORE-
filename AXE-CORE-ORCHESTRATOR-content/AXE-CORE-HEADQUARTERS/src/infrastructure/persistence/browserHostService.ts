/**
 * De browser-hosts en de keuze ertussen — opgeslagen, niet geraden.
 *
 * Durable (via userSettings) en niet localStorage: de keuze hoort hetzelfde te
 * zijn op de Mac Mini en op de telefoon, want het gaat over waar het WERK
 * gebeurt, niet over dit scherm.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { alleHosts, gekozenHost, VPS_HOST, type BrowserHost } from '@/domain/browserHosts';

const HOSTS_KEY = 'axe_browser_hosts';
const KEUZE_KEY = 'axe_browser_host_keuze';

export async function laadBrowserHosts(): Promise<BrowserHost[]> {
  const opgeslagen = await loadSetting<BrowserHost[] | null>(HOSTS_KEY, null);
  return alleHosts(Array.isArray(opgeslagen) ? opgeslagen : []);
}

/** De VPS is code, geen data — die wordt nooit opgeslagen. */
export async function bewaarBrowserHosts(lijst: readonly BrowserHost[]): Promise<void> {
  await saveSetting(HOSTS_KEY, lijst.filter(h => h.id !== VPS_HOST.id));
}

export async function browserHostKeuze(): Promise<string | null> {
  const v = await loadSetting<string | null>(KEUZE_KEY, null);
  return typeof v === 'string' && v ? v : null;
}

export async function kiesBrowserHost(id: string | null): Promise<void> {
  await saveSetting(KEUZE_KEY, id);
}

/**
 * De basis waar de browser-aanroepen heen gaan, of leeg voor de VPS.
 *
 * Gecachet, want dit zit in het pad van elke stap van een browsersessie
 * (navigeren, klikken, lezen — tot zes rondes) en een instelling ophalen per
 * klik is een netwerkaanroep om een netwerkaanroep te doen. Kort genoeg dat een
 * wissel binnen een halve minuut meegaat.
 */
let cache: { basis: string; at: number } | null = null;
const TTL_MS = 30_000;

export function __resetBrowserHostCache(): void { cache = null; }

export async function browserBasis(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.basis;
  try {
    const [hosts, keuze] = await Promise.all([laadBrowserHosts(), browserHostKeuze()]);
    const basis = gekozenHost(hosts, keuze).url;
    cache = { basis, at: Date.now() };
    return basis;
  } catch {
    // Een onleesbare instelling mag de browser niet stilzetten: dan de VPS.
    return '';
  }
}

/**
 * Antwoordt DEZE host?
 *
 * Het lampje in het paneel keek eerst altijd naar de VPS-API, ook als er een
 * Mac gekozen was -- dan stond het groen terwijl de machine waar het werk
 * heen ging uit stond. Dat is precies de zekerheid die de keuze moest geven,
 * en het is de gevaarlijkste soort fout in dit paneel: het lampje is er om
 * niet te hoeven proberen.
 *
 * `browser_agent_app` heeft een `/health` die alleen liveness zegt en geen
 * Chromium start -- dat is met opzet, want een health-check die per peiling een
 * browser opent is zelf de storing.
 *
 * Een korte deadline, want dit loopt terwijl een paneel openklapt: liever snel
 * "weet ik niet" dan een seconde wachten op een machine die uit staat.
 */
export async function browserHostAntwoordt(basis: string, timeoutMs = 2500): Promise<boolean> {
  if (!basis) return false;
  const stop = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(`${basis}/health`, { signal: stop });
    return res.ok;
  } catch {
    return false;
  }
}
