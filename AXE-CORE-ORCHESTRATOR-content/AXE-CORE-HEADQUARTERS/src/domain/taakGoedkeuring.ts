/**
 * Vraag Luka alleen als een actie het staande plan verlaat.
 *
 * Northsea: crews mailen al wat dat plan toestaat (kwalificatie, follow-up,
 * niet-bindend antwoord). Alleen een mail die het plan niet toestaat, een
 * betaling of een dealverzet vraagt. De vraag zegt wat, aan wie, en waarom.
 */
import { appVan, isAppId, type AppId } from '@/domain/apps';
import { APPS_MET_PLAN, type AppMetPlan } from '@/domain/appPlan';

export type PlanVerlating = 'send' | 'spend' | 'deal';

export interface GoedkeuringsVraag {
  wat: string;
  waarom: string;
  ja: string;
  tekst: string;
  aan?: string;
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

/** Mails die deal_automation_policy / de crews al mogen. */
const NORTHSEA_TOEGESTAAN = /\bqualif|\bfollow[- ]?up|\bfollowup|\bnon[- ]?binding/i;
/** Waar het bestaande Northsea-plan al om ja vraagt — zelfde grens als policy.py. */
const NORTHSEA_NIET = /\b(introduc|identity disclos|buyer identity|seller identity|counterparty identity|bank account|banking|swift|iban|commission|imfpa|ncnnda|ncnda|binding|contract execution|we accept|accept (price|offer)|sign(ature)?|whatsapp|imessage)\b/i;

function actieTekstVan(in_: ActieVoorGoedkeuring): string {
  return [in_.title, in_.goal, in_.detail].filter(Boolean).join('\n');
}

function appVoorActie(in_: ActieVoorGoedkeuring): AppId {
  if (isAppId(in_.app)) return in_.app;
  return appVan(in_.metadata);
}

export function northseaSendBinnenPlan(tekst: string): boolean {
  if (!NORTHSEA_TOEGESTAAN.test(tekst)) return false;
  const rest = tekst.replace(NORTHSEA_TOEGESTAAN, ' ');
  return !NORTHSEA_NIET.test(rest);
}

export function verlaatAppPlan(tekst: string, app?: AppId | null): PlanVerlating | null {
  if (VERSTUURT.test(tekst)) {
    if (app === 'northsea' && northseaSendBinnenPlan(tekst)) return null;
    return 'send';
  }
  if (GELD.test(tekst)) return 'spend';
  if (DEAL.test(tekst)) return 'deal';
  return null;
}

export function taakBinnenPlan(in_: ActieVoorGoedkeuring): boolean {
  const app = appVoorActie(in_);
  if (!APPS_MET_PLAN.includes(app as AppMetPlan)) return verlaatAppPlan(actieTekstVan(in_), app) === null;
  return verlaatAppPlan(actieTekstVan(in_), app) === null;
}

function korte(in_: ActieVoorGoedkeuring): string {
  const t = (in_.title || in_.goal || in_.detail || 'deze actie').replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

function vraag(wat: string, waarom: string, ja: string): GoedkeuringsVraag {
  return { wat, waarom, ja, tekst: `${wat}\n${waarom}\n${ja}` };
}

function aanWie(in_: ActieVoorGoedkeuring): string {
  const t = actieTekstVan(in_);
  const m = /\b(?:to|aan)\s+(?:the\s+)?([^\n.,]+)/i.exec(t);
  const wie = m?.[1]?.replace(/\s+/g, ' ').trim();
  return wie || 'onbekend';
}

export function goedkeuringVoorActie(in_: ActieVoorGoedkeuring): GoedkeuringsVraag | null {
  const app = appVoorActie(in_);
  const soort = verlaatAppPlan(actieTekstVan(in_), app);
  if (!soort) return null;
  const naam = korte(in_);
  if (soort === 'send') {
    const aan = aanWie(in_);
    return {
      ...vraag(
        `Dit is: een bericht versturen (${naam}).`,
        'Waarom: dit valt buiten het staande plan.',
        'Ja betekent: dit bericht mag nu weg.',
      ),
      aan,
      tekst: `Dit is: een bericht versturen (${naam}).\nAan wie: ${aan}.\nWaarom: dit valt buiten het staande plan.\nJa betekent: dit bericht mag nu weg.`,
    };
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
