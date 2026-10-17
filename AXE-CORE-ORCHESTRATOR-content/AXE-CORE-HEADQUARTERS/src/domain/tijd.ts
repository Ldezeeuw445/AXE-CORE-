/**
 * Home-tijden: Europe/Amsterdam, nooit ruwe ISO of JSON.
 *
 * Rails en live-kaarten kregen `2026-10-17T15:39:50.498309+00:00` en
 * `last: {"at": "..."}` omdat de server next_run_at/last_result door gaf.
 * Eén formatter, zelfde zone als de staande roosters.
 */
const ZONE = 'Europe/Amsterdam';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;

export function amsterdamKlok(at: string | number | Date | null | undefined): string {
  if (at == null || at === '') return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: ZONE });
}

export function amsterdamRelatief(at: string | number | Date | null | undefined, nu = Date.now()): string {
  if (at == null || at === '') return '';
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const min = Math.round((d.getTime() - nu) / 60_000);
  if (Math.abs(min) < 2) return 'now';
  if (min >= 2 && min < 120) return `in ${min} min`;
  if (min <= -2 && min > -120) return `${-min} min ago`;
  return amsterdamKlok(at);
}

/** "next 15:45" plus "in 6 min" when that still helps. */
export function nextTekst(at: string | null | undefined, nu = Date.now()): string {
  const klok = amsterdamKlok(at);
  if (!klok) return '—';
  const rel = amsterdamRelatief(at, nu);
  if (rel === 'now') return 'now';
  if (rel.startsWith('in ') || rel.endsWith('ago')) return `next ${klok} · ${rel}`;
  return `next ${klok}`;
}

function platJson(waarde: unknown, nu: number, diepte = 0): string {
  if (waarde == null) return '';
  if (typeof waarde === 'string') return mensTekst(waarde, nu);
  if (typeof waarde === 'number' || typeof waarde === 'boolean') return String(waarde);
  if (diepte > 3) return '';
  if (Array.isArray(waarde)) {
    return waarde.slice(0, 4).map((v) => platJson(v, nu, diepte + 1)).filter(Boolean).join(', ');
  }
  if (typeof waarde === 'object') {
    const d = waarde as Record<string, unknown>;
    const skip = new Set(['job', 'billing', 'costs', 'moved', 'invented', 'orders']);
    const delen: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (skip.has(k) || v == null || v === '' || v === 0) continue;
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        delen.push(`${k} ${amsterdamKlok(v)}`);
        continue;
      }
      const stuk = platJson(v, nu, diepte + 1);
      if (!stuk) continue;
      delen.push(typeof v === 'object' ? stuk : `${k} ${stuk}`);
    }
    return delen.slice(0, 6).join(', ');
  }
  return String(waarde);
}

export function mensTekst(ruw: unknown, nu = Date.now()): string {
  if (ruw == null) return '';
  if (typeof ruw === 'object') return platJson(ruw, nu).replace(/\s+/g, ' ').trim();
  let t = String(ruw).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      t = platJson(JSON.parse(t), nu) || t;
    } catch {
      /* laat de ISO-vervanging het verder doen */
    }
  }
  t = t.replace(ISO, (iso) => amsterdamKlok(iso) || iso);
  return t.replace(/\s+/g, ' ').trim();
}
