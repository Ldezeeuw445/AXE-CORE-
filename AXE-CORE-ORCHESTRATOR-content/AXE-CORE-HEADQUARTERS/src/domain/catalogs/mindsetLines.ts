/**
 * Two quote pools:
 * - Mindset: built-in power lines (rotated by Mindset button) — EN + NL
 * - AXE: fully user-owned list from Settings (rotated by AXE button)
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getReplyLanguage } from '@/domain/replyLanguage';

const USER_QUOTES_KEY = 'axe_mindset_quotes';
const MINDSET_INDEX_KEY = 'axe_mindset_builtin_index';
const AXE_INDEX_KEY = 'axe_mindset_user_index';

/** Built-in original lines — English. Used when reply language is en/auto. */
export const MINDSET_LINES: string[] = [
  "Winners don't wait for permission. They take the shot.",
  "Pressure is a privilege. Most people never get close enough to feel it.",
  "I don't hope. I position. Then I execute.",
  "Fear is just information. Use it. Don't wear it.",
  "If you're not early, you're not in the room that matters.",
  "Discipline beats motivation every single morning.",
  "The market doesn't care about your feelings. Neither do I.",
  "Stay calm. Stay sharp. Move first.",
  "Reputation is capital. Spend it carefully. Grow it aggressively.",
  "You don't rise by being liked. You rise by being right — and ready.",
  "When everyone freezes, that's your window.",
  "Build the edge. Protect the edge. Never explain the edge.",
  "Soft talk is for soft rooms. This isn't one.",
  "I play the long game with short, decisive moves.",
  "Doubt is expensive. Clarity is free if you earn it.",
  "Don't announce the plan. Ship the result.",
  "Control the controllable. Ignore the noise.",
  "Every setback is data. Extract it. Don't dramatize it.",
  "Loyalty is earned in the hard hours, not the easy wins.",
  "Be the person the room recalibrates around.",
  "Speed without judgment is chaos. Judgment without speed is loss.",
  "I don't need fair. I need prepared.",
  "Keep your circle small and your standards high.",
  "Today is another board. Play it like you already know the outcome.",
  "Complacency is the real competitor.",
  "Say less. Deliver more. Let the scoreboard talk.",
  "The best revenge is compound advantage.",
  "If it costs your focus, it's too expensive.",
  "Lead from the front. Bleed last. Win first.",
  "No excuses. No theater. Just the next correct move.",
  "Ambition without structure is a speech. Structure wins.",
  "I train for the moment before the moment arrives.",
  "Respect the risk. Dominate the setup.",
  "You are either building leverage or giving it away.",
  "Stay hungry. Stay dangerous. Stay kind to your own people.",
  "The loudest person in the room is rarely the one writing the check.",
  "Finish what you start. Start only what you'll finish.",
  "Power is quiet until it isn't.",
  "Make the hard choice early. Soft choices compound into failure.",
  "I don't chase validation. I chase asymmetric upside.",
];

/** Dutch equivalents — used when reply language is nl so spoken Mindset matches UI language. */
export const MINDSET_LINES_NL: string[] = [
  "Winnaars wachten niet op toestemming. Ze nemen het schot.",
  "Druk is een privilege. De meesten komen er nooit dichtbij genoeg.",
  "Ik hoop niet. Ik positioneer. Daarna voer ik uit.",
  "Angst is informatie. Gebruik het. Draag het niet.",
  "Ben je niet vroeg, dan zit je niet in de kamer die telt.",
  "Discipline wint elke ochtend van motivatie.",
  "De markt geeft niets om je gevoel. Ik ook niet.",
  "Blijf kalm. Blijf scherp. Beweeg eerst.",
  "Reputatie is kapitaal. Besteed het voorzichtig. Laat het groeien.",
  "Je stijgt niet door aardig te zijn. Je stijgt door gelijk te hebben — en klaar te zijn.",
  "Als iedereen bevriest, is dat jouw window.",
  "Bouw de edge. Bescherm de edge. Leg de edge nooit uit.",
  "Zachte praat is voor zachte kamers. Dit is er geen.",
  "Ik speel het lange spel met korte, beslissende zetten.",
  "Twijfel is duur. Helderheid is gratis als je het verdient.",
  "Kondig het plan niet aan. Lever het resultaat.",
  "Beheers wat je kunt beheersen. Negeer de ruis.",
  "Elke tegenslag is data. Haal het eruit. Maak er geen drama van.",
  "Loyaliteit verdien je in de zware uren, niet bij de makkelijke wins.",
  "Wees de persoon waar de kamer zich op herijkt.",
  "Snelheid zonder oordeel is chaos. Oordeel zonder snelheid is verlies.",
  "Ik heb geen fair nodig. Ik heb prepared nodig.",
  "Houd je cirkel klein en je standaard hoog.",
  "Vandaag is weer een bord. Speel alsof je de uitkomst al kent.",
  "Zelfgenoegzaamheid is de echte concurrent.",
  "Zeg minder. Lever meer. Laat het scorebord praten.",
  "De beste wraak is samengesteld voordeel.",
  "Kost het je focus, dan is het te duur.",
  "Leid van voren. Bloed als laatste. Win als eerste.",
  "Geen excuses. Geen theater. Alleen de volgende juiste zet.",
  "Ambitie zonder structuur is een speech. Structuur wint.",
  "Ik train voor het moment vóór het moment er is.",
  "Respecteer het risico. Domineer de setup.",
  "Je bouwt leverage of je geeft het weg.",
  "Blijf hongerig. Blijf gevaarlijk. Blijf aardig voor je eigen mensen.",
  "De luidste in de kamer schrijft zelden de check.",
  "Maak af wat je start. Start alleen wat je afmaakt.",
  "Macht is stil tot het dat niet meer is.",
  "Maak de harde keuze vroeg. Zachte keuzes stapelen tot falen.",
  "Ik jaag geen validatie. Ik jaag asymmetrische upside.",
];

function sanitize(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map(l => (typeof l === 'string' ? l.trim() : ''))
    .filter(l => l.length > 0)
    .slice(0, 200);
}

function nextFrom(pool: string[], indexKey: string): string | null {
  if (pool.length === 0) return null;
  let i = 0;
  try {
    i = Number(localStorage.getItem(indexKey) ?? '0') || 0;
  } catch { /* ignore */ }
  const line = pool[i % pool.length]!;
  try {
    localStorage.setItem(indexKey, String((i + 1) % pool.length));
  } catch { /* ignore */ }
  return line;
}

/** Mindset button — rotates built-in lines in the active reply language. */
export function nextMindsetLine(): string {
  const lang = getReplyLanguage();
  const pool = lang === 'nl' ? MINDSET_LINES_NL : MINDSET_LINES;
  return nextFrom(pool, MINDSET_INDEX_KEY) ?? pool[0]!;
}

/** AXE button — rotates user quotes from Settings. null if empty. */
export function nextAxeLine(): string | null {
  return nextFrom(getAxeQuotes(), AXE_INDEX_KEY);
}

export function getAxeQuotes(): string[] {
  try {
    const raw = localStorage.getItem(USER_QUOTES_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function setAxeQuotes(lines: string[]): void {
  const clean = sanitize(lines);
  try {
    localStorage.setItem(USER_QUOTES_KEY, JSON.stringify(clean));
    localStorage.setItem(AXE_INDEX_KEY, '0');
  } catch { /* ignore */ }
  void saveSetting(USER_QUOTES_KEY, clean);
}

export function addAxeQuote(line: string): string[] {
  const t = line.trim();
  if (!t) return getAxeQuotes();
  const next = [...getAxeQuotes(), t].slice(0, 200);
  setAxeQuotes(next);
  return next;
}

export function removeAxeQuote(index: number): string[] {
  const cur = getAxeQuotes();
  if (index < 0 || index >= cur.length) return cur;
  const next = cur.filter((_, i) => i !== index);
  setAxeQuotes(next);
  return next;
}

/** @deprecated aliases for older imports */
export const getMindsetQuotes = getAxeQuotes;
export const setMindsetQuotes = setAxeQuotes;
export const addMindsetQuote = addAxeQuote;
export const removeMindsetQuote = removeAxeQuote;
