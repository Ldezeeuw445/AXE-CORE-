/**
 * Aan- en afmelden voor meldingen op dít apparaat.
 *
 * ## Waar de rij heen gaat, en waarom niet in push_subscriptions
 *
 * Op hetzelfde Supabase-project staat al een `push_subscriptions` met 8 rijen,
 * en die komt in deze repo nergens voor: hij is van AXE Companion, dat dat
 * project deelt. Daar in schrijven is exact de fout die hier eerder maanden
 * kostte -- zie de kop van `chatPersistence.ts` over `public.messages` en
 * waarom AXE Core zijn eigen `axe_messages` kreeg. Dus een eigen tabel in de
 * `core_*`-naamruimte: `core_push_subscriptions`.
 *
 * ## Eén rij per apparaat, op het endpoint
 *
 * De pushdienst geeft per installatie een uniek endpoint. Dat is de sleutel,
 * niet het apparaat-id: een browser kan het abonnement vernieuwen en geeft dan
 * een nieuw endpoint voor hetzelfde toestel. Op endpoint upserten houdt dat
 * vanzelf netjes; het apparaat-id staat erbij zodat je in de tabel kunt zien
 * welke rij van welk toestel is.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { apparaatId } from '@/infrastructure/persistence/chatPersistence';
import { pushStand, type PushStand } from '@/domain/pushMogelijk';

const TABEL = 'core_push_subscriptions';
export const PUSH_TABEL = TABEL;
const LUKA_USER_ID = 'acff7a12-1111-481d-a7a9-cc07583b8069';

/**
 * De publieke helft van het VAPID-paar. Hoort in de bundel: daar is hij voor.
 *
 * De standaard staat hier en niet alleen in de bouwomgeving omdat de website
 * door Cloudflare gebouwd wordt, en een VITE_-variabele die daar vergeten wordt
 * een bundel zonder sleutel geeft zonder dat iets faalt: de knop werkt, de rij
 * wordt opgeslagen, en er komt nooit een melding. `VITE_VAPID_PUBLIC_KEY` wint
 * als hij gezet is.
 *
 * Moet exact de helft zijn van /etc/axe-vapid/private_key.pem op de API-VPS
 * (4 okt 2026). Wordt dat paar vervangen, dan hier ook -- een publieke sleutel
 * van het ene paar met een privésleutel van het andere weigert de pushdienst
 * stil.
 */
const VAPID_PUBLIEK_STANDAARD = 'BKAmZjoRcfSq_hbOIy_WrrVAhm10eOkvg0jOPfL84y7boU65aB1q0ufm6_dYthNDn87SWnAUjWBw-Jj4KZ3R3ww';
const VAPID_PUBLIEK = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || VAPID_PUBLIEK_STANDAARD;

/**
 * iOS geeft Web Push alleen aan een PWA op het beginscherm.
 *
 * `navigator.standalone` is Safari's eigen vlag en bestaat alleen daar; de
 * display-mode-query vangt Android en de desktop-PWA.
 */
function iosZonderInstallatie(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches === true;
  return !standalone;
}

/** Wat deze omgeving kan. Leest alleen, vraagt niets. */
export function meldingStand(): PushStand {
  if (typeof window === 'undefined') {
    return { kan: false, reden: 'Geen browser.', herstelbaar: false };
  }
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return pushStand({
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    toestemming: 'Notification' in window ? Notification.permission : null,
    tauri: w.__TAURI_INTERNALS__ !== undefined,
    iosZonderInstallatie: iosZonderInstallatie(),
    sleutel: VAPID_PUBLIEK.trim().length > 0,
  });
}

/** base64url → de bytes die `applicationServerKey` wil. */
function sleutelBytes(base64url: string): Uint8Array {
  const vulling = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + vulling).replace(/-/g, '+').replace(/_/g, '/');
  const ruw = atob(base64);
  const uit = new Uint8Array(ruw.length);
  for (let i = 0; i < ruw.length; i += 1) uit[i] = ruw.charCodeAt(i);
  return uit;
}

function sleutelUit(sub: PushSubscription, naam: 'p256dh' | 'auth'): string {
  const bytes = sub.getKey(naam);
  if (!bytes) return '';
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/** Staat dit apparaat al aangemeld bij de browser? */
export async function isAangemeld(): Promise<boolean> {
  if (!meldingStand().kan) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/**
 * Aanmelden. Moet vanuit een klik aangeroepen worden -- iOS weigert een
 * toestemmingsvraag zonder gebaar, zonder fout, waarna de knop "niets doet".
 */
export async function meldAan(): Promise<{ ok: true } | { ok: false; reden: string }> {
  const stand = meldingStand();
  if (!stand.kan) return { ok: false, reden: stand.reden };

  const toestemming = await Notification.requestPermission();
  if (toestemming !== 'granted') {
    return { ok: false, reden: 'Je hebt geen toestemming gegeven, dus er komt niets binnen.' };
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: sleutelBytes(VAPID_PUBLIEK.trim()) as BufferSource,
    });

  const sb = getSupabase();
  if (!sb) return { ok: false, reden: 'Geen verbinding met Supabase om dit apparaat op te slaan.' };
  const { data: sessie } = await sb.auth.getSession();
  const userId = sessie.session?.user?.id;
  if (!userId) return { ok: false, reden: 'Niet ingelogd, dus er is geen account om de melding aan te hangen.' };

  const { error } = await sb.from(TABEL).upsert({
    user_id: userId || LUKA_USER_ID,
    endpoint: sub.endpoint,
    p256dh: sleutelUit(sub, 'p256dh'),
    auth: sleutelUit(sub, 'auth'),
    apparaat: apparaatId(),
    failed_at: null,
  }, { onConflict: 'endpoint' });

  if (error) return { ok: false, reden: `Opslaan mislukte: ${error.message}` };
  return { ok: true };
}

/**
 * Als de browser al een subscription heeft, schrijf die opnieuw in de tabel
 * die de zender leest. Oude PWA-rijen stonden alleen in push_subscriptions.
 */
export async function herstelAanmelding(): Promise<void> {
  if (!meldingStand().kan) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data: sessie } = await sb.auth.getSession();
    const userId = sessie.session?.user?.id || LUKA_USER_ID;
    await sb.from(TABEL).upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sleutelUit(sub, 'p256dh'),
      auth: sleutelUit(sub, 'auth'),
      apparaat: apparaatId(),
      failed_at: null,
    }, { onConflict: 'endpoint' });
  } catch (e) {
    console.warn('[push] herstel aanmelding:', e);
  }
}

/** Eén testhij, zelfde message-vorm als de bel en de A17. */
export async function stuurTestPush(): Promise<{ ok: true } | { ok: false; reden: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, reden: 'Geen verbinding met Supabase.' };
  const { error } = await sb.from('core_notifications').insert({
    recipient: LUKA_USER_ID,
    type: 'info',
    message: 'Test push: if this reaches your lock screen, the sender is live.',
  });
  if (error) return { ok: false, reden: error.message };
  return { ok: true };
}

/** Afmelden: bij de browser én de rij weg, anders blijft de zender sturen naar
 *  een endpoint dat niets meer doet. */
export async function meldAf(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    const sb = getSupabase();
    if (sb) await sb.from(TABEL).delete().eq('endpoint', endpoint);
  } catch (e) {
    console.warn('[push] afmelden ging niet helemaal goed:', e);
  }
}

/** Het endpoint van dit apparaat, of null als het niet aangemeld is. */
async function eigenEndpoint(): Promise<string | null> {
  if (!meldingStand().kan) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Verbergt dit apparaat de inhoud van meldingen op het slotscherm? Staat per
 *  apparaat op de abonnementsrij (zie migratie 003): de iPhone in je zak wil dat
 *  anders dan de Mac op je bureau. Zonder rij is het antwoord: nee. */
export async function leesVerbergInhoud(): Promise<boolean> {
  const endpoint = await eigenEndpoint();
  const sb = getSupabase();
  if (!endpoint || !sb) return false;
  const { data } = await sb.from(TABEL).select('verberg_inhoud').eq('endpoint', endpoint).maybeSingle();
  return data?.verberg_inhoud === true;
}

/** Zet het voor dit apparaat. Geeft false als er geen rij was om te wijzigen --
 *  dan is er niets opgeslagen en moet de schakelaar dat ook zeggen, in plaats van
 *  te doen alsof het gelukt is. */
export async function zetVerbergInhoud(waarde: boolean): Promise<boolean> {
  const endpoint = await eigenEndpoint();
  const sb = getSupabase();
  if (!endpoint || !sb) return false;
  const { data, error } = await sb.from(TABEL).update({ verberg_inhoud: waarde }).eq('endpoint', endpoint).select('id');
  return !error && (data?.length ?? 0) > 0;
}
