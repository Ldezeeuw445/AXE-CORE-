/**
 * Deal-kaarten voor de telefoon: groeperen, nooit verzinnen.
 */
import { geld, getal } from '@/domain/northsea/desk';
import type { PipelineDeal } from '@/domain/northsea/tabs/typen';

export interface PhoneDealKaart {
  id: string;
  titel: string;
  status: string;
  tegenpartij: string;
  hoeveel: string;
  wanneer: string;
  okNodig: boolean;
  aantal: number;
}

function sleutelVan(d: PipelineDeal): string {
  const code = (d.code ?? '').trim().toLowerCase();
  if (code) return `code:${code}`;
  return [
    (d.product ?? d.commodity ?? '').trim().toLowerCase(),
    (d.koper ?? '').trim().toLowerCase(),
    (d.leverancier ?? '').trim().toLowerCase(),
    (d.execution_state ?? d.stage ?? '').trim().toLowerCase(),
  ].join('|');
}

function wanneerVan(iso: string | null | undefined, nu: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((nu - t) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function tegenpartijVan(d: PipelineDeal): string {
  const van = (d.leverancier ?? '').trim();
  const naar = (d.koper ?? '').trim();
  if (van && naar) return `${van} → ${naar}`;
  return van || naar || '—';
}

function hoeveelVan(d: PipelineDeal): string {
  const vol = getal(d.volume_mt);
  const waarde = getal(d.waarde);
  const stukken: string[] = [];
  if (vol != null) stukken.push(`${vol.toLocaleString('en-US', { maximumFractionDigits: 1 })} MT`);
  if (waarde != null) stukken.push(geld(waarde, d.valuta ?? 'USD'));
  return stukken.join(' · ');
}

export function groepeerTelefoonDeals(deals: readonly PipelineDeal[], nu = Date.now()): PhoneDealKaart[] {
  const groepen = new Map<string, PipelineDeal[]>();
  for (const d of deals) {
    const k = sleutelVan(d);
    const lijst = groepen.get(k);
    if (lijst) lijst.push(d);
    else groepen.set(k, [d]);
  }
  const kaarten: PhoneDealKaart[] = [];
  for (const groep of groepen.values()) {
    const nieuwste = [...groep].sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? a.created_at ?? '') || 0;
      const tb = Date.parse(b.updated_at ?? b.created_at ?? '') || 0;
      return tb - ta;
    })[0];
    kaarten.push({
      id: nieuwste.id,
      titel: (nieuwste.product || nieuwste.commodity || nieuwste.code || nieuwste.id.slice(0, 8)).trim(),
      status: String(nieuwste.execution_state || nieuwste.stage || '—').replace(/_/g, ' '),
      tegenpartij: tegenpartijVan(nieuwste),
      hoeveel: hoeveelVan(nieuwste),
      wanneer: wanneerVan(nieuwste.updated_at ?? nieuwste.created_at, nu),
      okNodig: nieuwste.akkoord_nodig === true,
      aantal: groep.length,
    });
  }
  return kaarten;
}
