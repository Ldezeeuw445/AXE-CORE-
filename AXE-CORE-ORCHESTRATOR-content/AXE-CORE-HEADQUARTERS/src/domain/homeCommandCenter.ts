/**
 * Home als command center (Luka, 25 nov: "echt als dat dashboard wat ik
 * stuurde"). Pure afleidingen voor de kaarten, zodat het scherm alleen
 * tekent. Niets verzonnen: wat niet gemeten is, komt hier als leeg terug.
 */

export type Toon = 'ok' | 'let-op' | 'fout' | 'uit';

export type ProviderStand = { configured: boolean; reachable: boolean; detail?: string };
export type ProviderTegel = { id: string; naam: string; toon: Toon; regel: string };

const PROVIDER_NAAM: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', claude: 'Claude', openrouter: 'OpenRouter', ollama: 'Ollama',
  xai: 'xAI', grok: 'Grok', gemini: 'Gemini', google: 'Google', groq: 'Groq', mistral: 'Mistral',
  deepseek: 'DeepSeek', cerebras: 'Cerebras', together: 'Together', perplexity: 'Perplexity',
};

function providerNaam(id: string): string {
  return PROVIDER_NAAM[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Eén tegel per provider: bereikbaar, ingesteld maar stil, of niet ingesteld. Bereikbaar eerst. */
export function providerTegels(providers: Record<string, ProviderStand> | null | undefined): ProviderTegel[] {
  if (!providers) return [];
  const orde: Record<Toon, number> = { ok: 0, 'let-op': 1, fout: 2, uit: 3 };
  return Object.entries(providers)
    .map(([id, p]): ProviderTegel => {
      const toon: Toon = p.reachable ? 'ok' : p.configured ? 'let-op' : 'uit';
      const regel = p.reachable ? 'Connected' : p.configured ? (p.detail || 'Not answering') : 'No key';
      return { id, naam: providerNaam(id), toon, regel };
    })
    .sort((a, b) => orde[a.toon] - orde[b.toon] || a.naam.localeCompare(b.naam));
}

export function llmTelling(providers: Record<string, ProviderStand> | null | undefined): { verbonden: number; ingesteld: number } | null {
  if (!providers) return null;
  const rijen = Object.values(providers);
  return { verbonden: rijen.filter((p) => p.reachable).length, ingesteld: rijen.filter((p) => p.configured).length };
}

/* ── Live feed ─────────────────────────────────────────────────────────── */

export type FeedSoort = 'fout' | 'klaar' | 'let-op' | 'info';
export type FeedRegel = { id: string; soort: FeedSoort; titel: string; sub: string; at: number | null; route: string };

export type FeedMelding = { id: string; type: string; title: string; detail: string; timestamp: number; read: boolean };
export type FeedFout = { at: string; app: string; name: string; status: string; detail: string; ref_id: string; source: string };
export type FeedTaak = { id: string; agent: string; titel: string; stand: string };

/**
 * Wat er net gebeurde, nieuwste eerst: mislukte runs uit het grootboek,
 * meldingen (PR's, cron, NorthSea) en de laatst afgeronde taken.
 * Dubbele onderwerpen vallen weg; taken zonder tijd komen achteraan.
 */
export function feedRegels(
  in_: { meldingen?: FeedMelding[]; fouten?: FeedFout[]; recent?: FeedTaak[] },
  max = 6,
): FeedRegel[] {
  const uit: FeedRegel[] = [];
  for (const f of in_.fouten ?? []) {
    const t = Date.parse(f.at);
    uit.push({
      id: `run:${f.ref_id || f.name}:${f.at}`,
      soort: 'fout',
      titel: `${f.name} failed`,
      sub: f.detail || f.app || f.source,
      at: Number.isFinite(t) ? t : null,
      route: '/ledger',
    });
  }
  for (const m of in_.meldingen ?? []) {
    const soort: FeedSoort = m.type === 'error' ? 'fout' : m.type === 'warning' ? 'let-op' : m.type === 'success' ? 'klaar' : 'info';
    uit.push({ id: `melding:${m.id}`, soort, titel: m.title, sub: m.detail, at: m.timestamp || null, route: '/notifications' });
  }
  for (const t of in_.recent ?? []) {
    uit.push({
      id: `taak:${t.id}`,
      soort: t.stand === 'failed' ? 'fout' : 'klaar',
      titel: `${t.agent} · ${t.stand === 'failed' ? 'failed' : 'done'}`,
      sub: t.titel,
      at: null,
      route: '/tasks',
    });
  }
  const gezien = new Set<string>();
  return uit
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1))
    .filter((r) => {
      const sleutel = `${r.titel}|${r.sub}`.toLowerCase();
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    })
    .slice(0, max);
}

/** "now", "5m", "2h", "3d". Leeg zonder tijd. */
export function geledenTekst(at: number | null, nu = Date.now()): string {
  if (at == null) return '';
  const s = Math.max(0, Math.round((nu - at) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ── Systeemmonitor ────────────────────────────────────────────────────── */

export type Machine = { id: string; name: string; online: boolean; cpu: number | null; mem: number | null; disk: number | null };

/** Hooguit twee machines voor de ringen: de Mac mini en de VPS als die er zijn, anders de eerste twee. */
export function kiesMachines(systems: Machine[] | null | undefined): Machine[] {
  if (!systems?.length) return [];
  const score = (m: Machine) => {
    const s = `${m.id} ${m.name}`.toLowerCase();
    if (/mini/.test(s)) return 0;
    if (/vps|server|strato/.test(s)) return 1;
    return 2;
  };
  return [...systems].sort((a, b) => score(a) - score(b)).slice(0, 2);
}

/** Een percentage voor een ring, of null als het niet gemeten is. */
export function ringWaarde(pct: number | null | undefined): number | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function ringToon(pct: number | null): Toon {
  if (pct == null) return 'uit';
  if (pct >= 90) return 'fout';
  if (pct >= 75) return 'let-op';
  return 'ok';
}

/* ── Tijdlijn ──────────────────────────────────────────────────────────── */

export type TijdItem = { id: string; tijd: string; titel: string; soort: string; kleur: string };

/** Wat er vandaag nog komt, vanaf nu, op tijd gesorteerd. */
export function vandaagVanafNu(
  items: Array<{ id: string; datum: string; tijd: string; titel: string; soort: string; kleur: string }>,
  vandaag: string,
  nuTijd: string,
  max = 5,
): TijdItem[] {
  return items
    .filter((i) => i.datum === vandaag && i.tijd >= nuTijd)
    .sort((a, b) => a.tijd.localeCompare(b.tijd))
    .slice(0, max)
    .map(({ id, tijd, titel, soort, kleur }) => ({ id, tijd, titel: titel.replace(/^Cron · /, ''), soort, kleur }));
}
