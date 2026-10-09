/**
 * De code-studio op een telefoon (Replit / Emergent-stijl): één paneel tegelijk, een onderbalk om
 * te wisselen, een toetsenbalk boven het toetsenbord en een "nieuw"-blad voor hele apps en features.
 *
 * Puur op papier: welke panelen er zijn, welke toetsen, welke sjablonen. De pagina tekent ze; hier
 * staan de regels, zodat ze getest kunnen worden zonder editor.
 */

export type MobielPaneel = 'agent' | 'files' | 'code' | 'term' | 'preview';

export const MOBIEL_PANELEN: ReadonlyArray<{ id: MobielPaneel; label: string }> = [
  { id: 'agent', label: 'Agent' },
  { id: 'files', label: 'Files' },
  { id: 'code', label: 'Code' },
  { id: 'term', label: 'Terminal' },
  { id: 'preview', label: 'Preview' },
];

export const PANEEL_KEY = 'axe_mobile_studio_paneel';

/** Opgeslagen waarde -> paneel. Alles wat niet klopt is "nog niet gekozen" en opent op Code. */
export function leesPaneel(raw: string | null | undefined): MobielPaneel {
  return MOBIEL_PANELEN.some(p => p.id === raw) ? (raw as MobielPaneel) : 'code';
}

// ── toetsenbalk ────────────────────────────────────────────────────────────

export type ToetsCommando = 'links' | 'rechts' | 'omhoog' | 'omlaag' | 'ongedaan' | 'opnieuw' | 'inspringen' | 'uitspringen' | 'commentaar';

export interface Toets {
  /** Wat op de knop staat. */
  label: string;
  /** Tekst die op de cursor komt. Bij een paar komen beide helften en staat de cursor ertussen. */
  tekst?: string;
  paar?: readonly [string, string];
  commando?: ToetsCommando;
}

/** De toetsen die een telefoontoetsenbord verstopt op meerdere lagen: haakjes, tab, pijlen. */
export const TOETSEN: readonly Toets[] = [
  { label: 'Tab', commando: 'inspringen' },
  { label: '⇤', commando: 'uitspringen' },
  { label: '{ }', paar: ['{', '}'] },
  { label: '( )', paar: ['(', ')'] },
  { label: '[ ]', paar: ['[', ']'] },
  { label: '< >', paar: ['<', '>'] },
  { label: '" "', paar: ['"', '"'] },
  { label: "' '", paar: ["'", "'"] },
  { label: '`', paar: ['`', '`'] },
  { label: ';', tekst: ';' },
  { label: ':', tekst: ':' },
  { label: '=', tekst: '=' },
  { label: '=>', tekst: ' => ' },
  { label: '/', tekst: '/' },
  { label: '//', commando: 'commentaar' },
  { label: '#', tekst: '#' },
  { label: '$', tekst: '$' },
  { label: '_', tekst: '_' },
  { label: '←', commando: 'links' },
  { label: '→', commando: 'rechts' },
  { label: '↑', commando: 'omhoog' },
  { label: '↓', commando: 'omlaag' },
  { label: '↶', commando: 'ongedaan' },
  { label: '↷', commando: 'opnieuw' },
];

/** Wat een paar-toets invoegt, en hoeveel tekens de cursor terug moet om tussen de helften te staan. */
export function paarInvoeging(paar: readonly [string, string], geselecteerd = ''): { tekst: string; terug: number } {
  return geselecteerd
    ? { tekst: `${paar[0]}${geselecteerd}${paar[1]}`, terug: 0 }
    : { tekst: paar[0] + paar[1], terug: paar[1].length };
}

// ── hele apps en features ──────────────────────────────────────────────────

export interface Bouwsteen {
  id: string;
  titel: string;
  uitleg: string;
  /** Wat de code-agent krijgt. Staat vooraf in het invoerveld, zodat Luka het kan aanpassen voor het gaat. */
  opdracht: string;
}

const AFSLUITING = ' Work in small steps, run it, fix what breaks, and tell me what you built and how to open it.';

export const APP_SJABLONEN: readonly Bouwsteen[] = [
  {
    id: 'vite-react', titel: 'React app', uitleg: 'Vite, React, TypeScript, Tailwind',
    opdracht: 'Create a new app in apps/<name>: Vite + React + TypeScript + Tailwind, a clean responsive layout with a header and one example page, and a README. Start the dev server so I can preview it.' + AFSLUITING,
  },
  {
    id: 'nextjs', titel: 'Next.js site', uitleg: 'App Router, server components',
    opdracht: 'Create a new Next.js (App Router, TypeScript, Tailwind) site in apps/<name> with a home page, an about page and a contact form that validates input. Start the dev server.' + AFSLUITING,
  },
  {
    id: 'fastapi', titel: 'API (FastAPI)', uitleg: 'Python, typed routes, tests',
    opdracht: 'Create a FastAPI service in apps/<name> with typed routes, a /health route, pydantic models, an in-memory store behind a repository class, and pytest tests. Run the tests.' + AFSLUITING,
  },
  {
    id: 'landing', titel: 'Landing page', uitleg: 'Hero, features, pricing, footer',
    opdracht: 'Build a polished landing page in apps/<name>: hero with a clear headline, three feature blocks, pricing, FAQ and footer. Mobile first, light and dark. Start the dev server.' + AFSLUITING,
  },
  {
    id: 'dashboard', titel: 'Dashboard', uitleg: 'Cards, charts, a data table',
    opdracht: 'Build a dashboard app in apps/<name>: KPI cards, two charts, a sortable table, a date filter, mock data behind a data layer I can swap for a real API. Start the dev server.' + AFSLUITING,
  },
  {
    id: 'bot', titel: 'Bot of script', uitleg: 'Een taak die op een schema draait',
    opdracht: 'Create a small Python script in apps/<name> that runs on a schedule, logs what it does, reads its settings from a .env file and has a --dry-run flag. Add a README with how to run it.' + AFSLUITING,
  },
];

export const FEATURE_IDEEEN: readonly Bouwsteen[] = [
  { id: 'login', titel: 'Login', uitleg: 'Aanmelden met Supabase', opdracht: 'Add sign-in and sign-up to the current app with Supabase auth: a login page, a protected route and a sign-out button. Show a clear error when it fails.' + AFSLUITING },
  { id: 'database', titel: 'Database', uitleg: 'Tabel en lijst met toevoegen/wijzigen', opdracht: 'Add a database-backed list to the current app: a table with a migration, create / edit / delete from the UI, and loading and empty states.' + AFSLUITING },
  { id: 'api', titel: 'API-route', uitleg: 'Een endpoint met validatie', opdracht: 'Add an API route to the current app with input validation, a typed response, error handling and a test.' + AFSLUITING },
  { id: 'dark', titel: 'Donker/licht', uitleg: 'Thema-wissel die onthouden wordt', opdracht: 'Add a dark / light theme switch to the current app that follows the system by default and remembers the choice.' + AFSLUITING },
  { id: 'upload', titel: 'Uploaden', uitleg: 'Bestanden kiezen en bewaren', opdracht: 'Add file upload to the current app: pick a file, show progress, store it, list uploaded files with a delete button.' + AFSLUITING },
  { id: 'payments', titel: 'Betalen', uitleg: 'Stripe checkout (testmodus)', opdracht: 'Add a Stripe checkout flow in test mode to the current app: a pricing page, a checkout session, a success and a cancel page. Use test keys only.' + AFSLUITING },
  { id: 'realtime', titel: 'Realtime', uitleg: 'Live bijwerken zonder verversen', opdracht: 'Make the main list in the current app update live (realtime subscription or polling fallback) without a page refresh.' + AFSLUITING },
  { id: 'deploy', titel: 'Online zetten', uitleg: 'Naar Cloudflare Pages', opdracht: 'Prepare the current app for deployment on Cloudflare Pages: build settings, environment variable list, and the exact steps. Do not deploy; tell me when it is ready for my approval.' + AFSLUITING },
  { id: 'fix', titel: 'Fouten opsporen', uitleg: 'Draai alles en repareer wat stuk is', opdracht: 'Run the type check, the linter and the tests on the current project, fix every failure you can, and report what is left.' },
  { id: 'review', titel: 'Code nakijken', uitleg: 'Wat kan beter en wat is risicovol', opdracht: 'Review the current project: list the three riskiest things, the three biggest simplifications and what has no test. Do not change anything yet.' },
];
