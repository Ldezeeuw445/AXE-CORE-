/**
 * Keys per app als overzicht (Luka 23 nov): kerncijfers, een pil per sleutel en
 * alleen wat echt van Luka is bij "Needs a fix". Puur; de pagina tekent het.
 */
/** Zelfde vorm als KeyRow uit de gateway; domain kent infrastructure niet. */
export type KeyStatus = 'works' | 'present' | 'missing' | 'broken' | 'unseen' | 'optional' | 'unused';
export type KeyRow = {
  name: string;
  purpose: string;
  status: KeyStatus;
  need?: 'required' | 'optional' | 'unused';
  usage?: {
    calls_today: number; ok_today: number; failed_today: number; limited_today: number; tokens_today: number;
    calls_yesterday: number; calls_7d: number; last_status: number | null; last_at: string | null;
  };
};
export type KeysPerApp = { keys: KeyRow[] };

export type Pil = { tekst: string; toon: 'ok' | 'bad' | 'warn' | 'info' | 'muted' };

const BASIS: Record<KeyStatus, Pil> = {
  works: { tekst: 'Works', toon: 'ok' },
  present: { tekst: 'Set', toon: 'info' },
  missing: { tekst: 'Missing', toon: 'warn' },
  broken: { tekst: 'Broken', toon: 'bad' },
  unseen: { tekst: 'Not visible', toon: 'muted' },
  optional: { tekst: 'Optional', toon: 'muted' },
  unused: { tekst: 'Not used', toon: 'muted' },
};

/** De pil van één sleutel: het laatste echte antwoord wint van "staat er". */
export function sleutelPil(k: KeyRow): Pil {
  const u = k.usage;
  if (u?.last_status === 402) return { tekst: 'No credits', toon: 'bad' };
  if (u?.last_status === 429) return { tekst: 'Rate limited', toon: 'warn' };
  if (u && u.ok_today > 0 && (k.status === 'present' || k.status === 'unseen')) return { tekst: 'Works', toon: 'ok' };
  return BASIS[k.status] ?? BASIS.unseen;
}

export function verbruikTekst(k: KeyRow): string {
  const u = k.usage;
  if (!u || !u.calls_7d) return k.status === 'optional' || k.status === 'unused' ? 'Not needed now' : 'No calls counted yet';
  const deel = [`${u.calls_today} today`];
  if (u.calls_today) deel.push(`${Math.round((u.ok_today / u.calls_today) * 100)}% ok`);
  if (u.limited_today) deel.push(`${u.limited_today} limited`);
  if (!u.calls_today) deel.push(`${u.calls_7d} in 7d`);
  return deel.join(' · ');
}

function uniekeSleutels(apps: KeysPerApp[]): KeyRow[] {
  const per = new Map<string, KeyRow>();
  for (const a of apps) for (const k of a.keys) if (!per.has(k.name)) per.set(k.name, k);
  return [...per.values()];
}

export function sleutelKpis(apps: KeysPerApp[]) {
  const alle = uniekeSleutels(apps);
  const pillen = alle.map(sleutelPil);
  const werkt = pillen.filter((p) => p.tekst === 'Works').length;
  const stuk = pillen.filter((p) => p.toon === 'bad').length;
  const limiet = pillen.filter((p) => p.tekst === 'Rate limited').length;
  const vandaag = alle.reduce((n, k) => n + (k.usage?.calls_today ?? 0), 0);
  const gisteren = alle.reduce((n, k) => n + (k.usage?.calls_yesterday ?? 0), 0);
  const tokens = alle.reduce((n, k) => n + (k.usage?.tokens_today ?? 0), 0);
  return { totaal: alle.length, werkt, stuk, limiet, vandaag, gisteren, tokens };
}

/** Alleen wat Luka moet doen: verplicht en kapot/ontbrekend, of geen tegoed. */
export function sleutelFixes(apps: KeysPerApp[]): { naam: string; waarom: string }[] {
  return uniekeSleutels(apps).flatMap((k) => {
    const pil = sleutelPil(k);
    if (pil.tekst === 'No credits') return [{ naam: k.name, waarom: `out of credits — ${k.purpose}` }];
    if (k.need !== 'required') return [];
    if (k.status === 'broken') return [{ naam: k.name, waarom: `rejected — ${k.purpose}` }];
    if (k.status === 'missing') return [{ naam: k.name, waarom: `not set on the VPS — ${k.purpose}` }];
    return [];
  });
}
