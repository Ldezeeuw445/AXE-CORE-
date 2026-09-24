/**
 * Eén zin, meerdere taken. De classifier zelf schrijft geen antwoord;
 * dit knipt alleen de stukken zodat elk een eigen job krijgt.
 */
import { classifyAxeTier, type AxeRoute } from '@/domain/tierRouter/axeRoute';

const SPLIT_RE = /\s*(?:,\s*(?:en|and|plus)\s+|;\s+|\s+en\s+|\s+and\s+|\s+plus\s+|,\s+)\s*/i;

export interface AxeBeurtStuk {
  text: string;
  route: AxeRoute;
}

function isJob(route: AxeRoute): boolean {
  if (route.tier === 3) return true;
  if (route.tier === 2) return true;
  return false;
}

/**
 * Knip een beurt in stukken als er minstens twee losse jobs in zitten.
 * Groeten blijven aan het geheel; één vraag zonder voegwoord blijft één stuk.
 */
export function splitsAxeBeurten(text: string): AxeBeurtStuk[] {
  const t = (text || '').trim();
  if (!t) return [];
  const delen = t.split(SPLIT_RE).map((s) => s.trim()).filter((s) => s.length >= 4);
  if (delen.length < 2) {
    return [{ text: t, route: classifyAxeTier(t) }];
  }
  const stukken = delen.map((deel) => ({ text: deel, route: classifyAxeTier(deel) }));
  const jobs = stukken.filter((s) => isJob(s.route));
  if (jobs.length >= 2) return stukken;
  return [{ text: t, route: classifyAxeTier(t) }];
}

export function jobStukkenVan(stukken: AxeBeurtStuk[]): AxeBeurtStuk[] {
  return stukken.filter((s) => isJob(s.route));
}
