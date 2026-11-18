/**
 * Portal-opslag (18 nov 2026): de rij in core_portal, het bestand in de
 * privé-bucket axe-portal. Zie src/domain/portal/portal.ts voor de regels.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { opslagPad, PORTAL_MAX_BYTES, VERS_BINNEN_MS, type PortalRij } from '@/domain/portal/portal';

function sb() {
  const c = getSupabase();
  if (!c) throw new Error('Supabase niet ingesteld');
  return c;
}

function nieuwId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Gooi een bestand: eerst het bestand, dan pas de rij (een Mac ziet nooit een rij zonder bestand). */
export async function gooiBestand(file: File, naar: string, van: string): Promise<PortalRij> {
  if (file.size > PORTAL_MAX_BYTES) throw new Error('Te groot: Portal neemt tot 50 MB');
  const id = nieuwId();
  const pad = opslagPad(id, file.name || 'bestand');
  const up = await sb().storage.from('axe-portal').upload(pad, file, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await sb().from('core_portal').insert({
    id, van, naar, soort: 'bestand', naam: file.name || 'bestand', mime: file.type || '', grootte: file.size, pad,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as PortalRij;
}

export async function gooiTekst(tekst: string, naar: string, van: string): Promise<PortalRij> {
  const { data, error } = await sb().from('core_portal').insert({
    van, naar, soort: 'tekst', naam: 'Klembord', grootte: tekst.length, tekst: tekst.slice(0, 200_000),
  }).select().single();
  if (error) throw new Error(error.message);
  return data as PortalRij;
}

/** Wat nog niet is opgehaald, van de laatste 24 uur. */
export async function openWorpen(): Promise<PortalRij[]> {
  const sinds = new Date(Date.now() - VERS_BINNEN_MS).toISOString();
  const { data, error } = await sb().from('core_portal').select('*')
    .is('opgehaald_at', null).gte('created_at', sinds).order('created_at', { ascending: true }).limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as PortalRij[];
}

/** Claim een worp; null als een andere Mac hem net pakte. */
export async function claimWorp(id: string, mijnId: string): Promise<PortalRij | null> {
  const { data, error } = await sb().from('core_portal')
    .update({ opgehaald_door: mijnId, opgehaald_at: new Date().toISOString() })
    .eq('id', id).is('opgehaald_at', null).select();
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as PortalRij | undefined) ?? null;
}

/** Kortlevende link voor de Mac om het bestand zelf te downloaden. */
export async function getekendeLink(pad: string): Promise<string> {
  const { data, error } = await sb().storage.from('axe-portal').createSignedUrl(pad, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'geen link');
  return data.signedUrl;
}

/** De laatste worpen, voor de geschiedenis op de telefoon. */
export async function recenteWorpen(n = 8): Promise<PortalRij[]> {
  const { data, error } = await sb().from('core_portal').select('*').order('created_at', { ascending: false }).limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as PortalRij[];
}
