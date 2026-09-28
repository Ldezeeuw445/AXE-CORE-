/**
 * Mag de autopilot voor dit symbool opnieuw een onderzoek starten?
 *
 * Gemeten 14 september op de VPS: 33 CrewAI-runs tegelijk, elk ~185 MB, en
 * geen enkele maakte iets af. De autopilot draait elke 15 minuten per symbool
 * een volledig onderzoek: een crew op de VPS, elf rollen op sleutels en de
 * eindbeslissing op het abonnement. Hij wacht daar 45 seconden op en gaat dan
 * door -- maar het onderzoek zelf loopt op de achtergrond verder, en de crew
 * op de VPS nog tien minuten. De volgende cyclus start er gewoon een nieuwe
 * naast.
 *
 * Een swing-these verandert niet elk kwartier. Eén onderzoek per uur per
 * symbool geeft dezelfde beslissingen met een kwart van de tokens, en de
 * cyclus zelf blijft elke 15 minuten draaien op het laatste rapport.
 *
 * Twee redenen om over te slaan:
 *   - er is een afgerond rapport jonger dan `versMs`;
 *   - er loopt er nog een van een vorige cyclus (jonger dan `bezigMs`). Een
 *     'running' van langer geleden is achtergelaten en telt niet.
 */
import type { TradingIntelReport } from './types';

export const RESEARCH_VERS_MS = 60 * 60 * 1000;
export const RESEARCH_BEZIG_MS = 10 * 60 * 1000;

export type ResearchBesluit =
  | { draaien: true }
  | { draaien: false; reden: 'vers' | 'bezig'; rapport: TradingIntelReport };

export function moetResearchDraaien(
  rapporten: readonly TradingIntelReport[],
  ticker: string,
  nu: number,
  versMs: number = RESEARCH_VERS_MS,
  bezigMs: number = RESEARCH_BEZIG_MS,
): ResearchBesluit {
  const t = ticker.trim().toUpperCase();
  for (const r of rapporten) {
    if ((r.ticker || '').trim().toUpperCase() !== t) continue;
    const leeftijd = nu - Date.parse(r.updatedAt || r.createdAt || '');
    if (!Number.isFinite(leeftijd) || leeftijd < 0) continue;
    if (r.status === 'complete' && leeftijd < versMs) return { draaien: false, reden: 'vers', rapport: r };
    if (r.status === 'running' && leeftijd < bezigMs) return { draaien: false, reden: 'bezig', rapport: r };
  }
  return { draaien: true };
}
