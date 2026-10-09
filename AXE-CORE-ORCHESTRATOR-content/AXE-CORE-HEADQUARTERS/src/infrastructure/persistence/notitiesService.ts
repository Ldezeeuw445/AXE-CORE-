/**
 * Waar notities blijven. Supabase (`core_kb_documents`, categorie "Quick Notes") is de bron; deze laag
 * zorgt dat er niets verloren gaat als Supabase even niet antwoordt.
 *
 * ## Eerst lokaal, dan de cloud
 *
 * Elke wijziging komt EERST in localStorage (`axe_notities_wacht_v1`) en gaat daarna naar Supabase.
 * Lukt dat, dan verdwijnt hij uit de wachtrij; lukt het niet (offline, verlopen sessie, een storing),
 * dan blijft hij staan en wordt hij opnieuw geprobeerd bij het volgende signaal (venster-focus, weer
 * online, elke 30 s). Een notitie die je net typte kan dus niet verdwijnen doordat een verzoek mislukte.
 * Het venster zegt wat er aan de hand is ("Saved" / "Saving…" / "Waiting for connection") in plaats van
 * te doen alsof het gelukt is.
 *
 * Meerdere vensters (de app, het zwevende notitiesvenster) zien elkaars wijzigingen via een
 * BroadcastChannel.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { saneerNotitieHtml } from '@/domain/notities/saneer';
import { NIEUWE_TITEL, NOTITIE_CATEGORIE, titelUit, type Notitie } from '@/domain/notities/notities';

const WACHT_KEY = 'axe_notities_wacht_v1';
const CACHE_KEY = 'axe_notities_cache_v1';
const ALIAS_KEY = 'axe_notities_alias_v1';
const KANAAL = 'axe-notities';

interface Wachtend { inhoud: string; nieuw?: boolean; weg?: boolean; t: number }
type Wachtrij = Record<string, Wachtend>;

function lees<T>(key: string, leeg: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : leeg; } catch { return leeg; }
}
function schrijf(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* vol of privémodus: de cloud heeft hem dan alsnog, als die antwoordt */ }
}

const wachtrij = (): Wachtrij => lees<Wachtrij>(WACHT_KEY, {});
const zetWachtrij = (w: Wachtrij) => schrijf(WACHT_KEY, w);

/** Lokale id -> de echte id, zodra de cloud de notitie heeft aangemaakt. Een venster dat hem nog vasthoudt blijft werken. */
const aliassen = () => lees<Record<string, string>>(ALIAS_KEY, {});
export const echteId = (id: string): string => aliassen()[id] ?? id;

/** Een id die nog geen rij in Supabase heeft. */
const isLokaleId = (id: string) => id.startsWith('lokaal-');

let kanaal: BroadcastChannel | null = null;
function bc(): BroadcastChannel | null {
  if (kanaal) return kanaal;
  try { kanaal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KANAAL); } catch { kanaal = null; }
  return kanaal;
}
function meldWijziging(): void { try { bc()?.postMessage('wijziging'); } catch { /* ander venster is weg */ } }
/** Roep `bij` aan als een ander venster iets wijzigde. Geeft de afmelder terug. */
export function opWijziging(bij: () => void): () => void {
  const k = bc();
  if (!k) return () => {};
  const h = () => bij();
  k.addEventListener('message', h);
  return () => k.removeEventListener('message', h);
}

interface Rij { id: string; title: string; content: string | null; created_at: string; updated_at: string }
const naarNotitie = (r: Rij): Notitie => ({
  id: r.id, titel: r.title || NIEUWE_TITEL, inhoud: r.content ?? '', gemaakt: r.created_at, aangepast: r.updated_at,
});

/** De lijst, nieuwste eerst. Zonder cloud: de laatst bekende lijst, met wat nog wacht erbovenop. */
export async function laadNotities(): Promise<{ notities: Notitie[]; online: boolean }> {
  await synchroniseer();
  let uit: Notitie[] | null = null;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('core_kb_documents').select('id,title,content,created_at,updated_at')
      .eq('category', NOTITIE_CATEGORIE).order('updated_at', { ascending: false }).limit(500);
    if (!error && data) { uit = (data as Rij[]).map(naarNotitie); schrijf(CACHE_KEY, uit); }
  }
  const basis = uit ?? lees<Notitie[]>(CACHE_KEY, []);
  // Wat nog niet in de cloud staat, staat wel in de lijst: anders lijkt een notitie weg.
  const wacht = wachtrij();
  const lijst = basis.filter(n => !wacht[n.id]?.weg).map(n => (wacht[n.id] && !wacht[n.id].weg ? { ...n, inhoud: wacht[n.id].inhoud, titel: titelUit(wacht[n.id].inhoud) } : n));
  for (const [id, w] of Object.entries(wacht)) {
    if (w.nieuw && !w.weg && !lijst.some(n => n.id === id)) {
      const t = new Date(w.t).toISOString();
      lijst.unshift({ id, titel: titelUit(w.inhoud), inhoud: w.inhoud, gemaakt: t, aangepast: t });
    }
  }
  return { notities: lijst, online: uit !== null };
}

/** Een nieuwe, lege notitie. Staat meteen in de lijst; de cloud volgt. */
export async function maakNotitie(inhoud = ''): Promise<Notitie> {
  const id = `lokaal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const w = wachtrij();
  w[id] = { inhoud, nieuw: true, t: Date.now() };
  zetWachtrij(w);
  const t = new Date().toISOString();
  void synchroniseer();
  return { id, titel: titelUit(inhoud), inhoud, gemaakt: t, aangepast: t };
}

/** Bewaar de nieuwe tekst. Eerst lokaal, dan de cloud; geeft terug of de cloud het heeft. */
export async function bewaarNotitie(vastgehouden: string, inhoud: string): Promise<'opgeslagen' | 'wacht'> {
  const id = echteId(vastgehouden);
  const schoon = saneerNotitieHtml(inhoud);
  const w = wachtrij();
  w[id] = { ...w[id], inhoud: schoon, t: Date.now() };
  zetWachtrij(w);
  await synchroniseer();
  return wachtrij()[id] ? 'wacht' : 'opgeslagen';
}

export async function verwijderNotitie(vastgehouden: string): Promise<void> {
  const id = echteId(vastgehouden);
  const w = wachtrij();
  if (isLokaleId(id) && w[id]?.nieuw) {
    delete w[id];   // nooit in de cloud geweest
    zetWachtrij(w);
    meldWijziging();
    return;
  }
  w[id] = { inhoud: '', weg: true, t: Date.now() };
  zetWachtrij(w);
  await synchroniseer();
}

let bezig = false;
/** Stuur wat wacht naar de cloud. Veilig om vaak aan te roepen. */
export async function synchroniseer(): Promise<void> {
  if (bezig) return;
  const sb = getSupabase();
  const w = wachtrij();
  if (!sb || Object.keys(w).length === 0) return;
  bezig = true;
  try {
    let gewijzigd = false;
    for (const [id, item] of Object.entries(w)) {
      if (item.weg) {
        const { error } = await sb.from('core_kb_documents').delete().eq('id', id);
        if (error) continue;
      } else if (item.nieuw && isLokaleId(id)) {
        const { data, error } = await sb.from('core_kb_documents').insert({
          title: titelUit(item.inhoud), content: item.inhoud, category: NOTITIE_CATEGORIE, ai: 'axe-core', source: 'user',
        }).select('id').single();
        if (error || !data) continue;
        // De lokale id wordt de echte; een editor die hem nog vasthoudt vindt hem via echteId().
        schrijf(ALIAS_KEY, { ...aliassen(), [id]: (data as { id: string }).id });
        const nu = wachtrij();
        // Stond er intussen al een nieuwere tekst voor deze notitie? Dan hoort die onder de echte id.
        if (nu[id] && nu[id].t !== item.t) nu[(data as { id: string }).id] = { inhoud: nu[id].inhoud, t: nu[id].t };
        delete nu[id];
        zetWachtrij(nu);
        gewijzigd = true;
        continue;
      } else {
        const { error } = await sb.from('core_kb_documents').update({
          title: titelUit(item.inhoud), content: item.inhoud, updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) continue;
      }
      const nu = wachtrij();
      // Alleen weghalen als er intussen niets nieuwers is getypt.
      if (nu[id] && nu[id].t === item.t) { delete nu[id]; zetWachtrij(nu); }
      gewijzigd = true;
    }
    if (gewijzigd) meldWijziging();
  } catch { /* offline: het blijft in de wachtrij */ } finally { bezig = false; }
}

/** Hoeveel wijzigingen wachten er nog op de cloud? Voor de regel onderin het venster. */
export function aantalWachtend(): number { return Object.keys(wachtrij()).length; }
