/**
 * Vraag Luka alleen als een actie het staande plan verlaat.
 *
 * Binnen het plan (AXE Core maken, Northsea laten draaien, trading analyseren)
 * geen akkoord. Wel bij versturen, geld uitgeven, of een deal verzetten.
 * De vraag zegt in het Nederlands wat het is, waarom, en wat ja doet.
 */
import { appVan, isAppId, type AppId } from '@/domain/apps';
import { APPS_MET_PLAN, type AppMetPlan } from '@/domain/appPlan';

export type PlanVerlating = 'send' | 'spend' | 'deal';

export interface GoedkeuringsVraag {
  wat: string;
  waarom: string;
  ja: string;
  tekst: string;
}

export interface ActieVoorGoedkeuring {
  title?: string | null;
  goal?: string | null;
  detail?: string | null;
  app?: AppId | string | null;
  metadata?: Record<string, unknown> | null;
}

const VERSTUURT = /\b(send|email|mail|imessage|whatsapp|verstuur|stuur een)\b|auto_send|auto_reply/i;
const GELD = /\b(spend|betaal|betalen|payment|invoice|live order|market order|place (an? )?order|plaats (een )?order|wire money|transfer money)\b/i;
const DEAL = /\b(move (the |a )?deal|verplaats (de |een )?deal|deal naar|close (the |a )?deal|sluit (de |een )?deal|change deal|update deal (stage|status)|deal stage)\b/i;

function actieTekstVan(in_: ActieVoorGoedkeuring): string {
  return [in_.title, in_.goal, in_.detail].filter(Boolean).join('\n');
}

function appVoorActie(in_: ActieVoorGoedkeuring): AppId {
  if (isAppId(in_.app)) return in_.app;
  return appVan(in_.metadata);
}

export function verlaatAppPlan(tekst: string): PlanVerlating | null {
  if (VERSTUURT.test(tekst)) return 'send';
  if (GELD.test(tekst)) return 'spend';
  if (DEAL.test(tekst)) return 'deal';
  return null;
}

export function taakBinnenPlan(in_: ActieVoorGoedkeuring): boolean {
  const app = appVoorActie(in_);
  if (!APPS_MET_PLAN.includes(app as AppMetPlan)) return verlaatAppPlan(actieTekstVan(in_)) === null;
  return verlaatAppPlan(actieTekstVan(in_)) === null;
}

function korte(in_: ActieVoorGoedkeuring): string {
  const t = (in_.title || in_.goal || in_.detail || 'deze actie').replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

function vraag(wat: string, waarom: string, ja: string): GoedkeuringsVraag {
  return { wat, waarom, ja, tekst: `${wat}\n${waarom}\n${ja}` };
}

export function goedkeuringVoorActie(in_: ActieVoorGoedkeuring): GoedkeuringsVraag | null {
  const soort = verlaatAppPlan(actieTekstVan(in_));
  if (!soort) return null;
  const naam = korte(in_);
  if (soort === 'send') {
    return vraag(
      `Dit is: een bericht versturen (${naam}).`,
      'Waarom: dit valt buiten het staande plan. Berichten gaan niet vanzelf de deur uit.',
      'Ja betekent: dit bericht mag nu weg.',
    );
  }
  if (soort === 'spend') {
    return vraag(
      `Dit is: geld uitgeven of een live order (${naam}).`,
      'Waarom: dit valt buiten het staande plan. Geen live order tot het account bevestigd is.',
      'Ja betekent: dit mag nu geld kosten of een live order plaatsen.',
    );
  }
  return vraag(
    `Dit is: een deal verzetten (${naam}).`,
    'Waarom: dit valt buiten het staande plan. Een deal verplaatsen is jouw beslissing.',
    'Ja betekent: deze deal mag nu verplaatst worden.',
  );
}
