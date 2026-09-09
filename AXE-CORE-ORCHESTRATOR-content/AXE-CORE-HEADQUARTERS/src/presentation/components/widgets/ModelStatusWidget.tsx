/**
 * ModelStatusWidget — dezelfde providers als het instellingenscherm, compact.
 *
 * Hier stond een eigen lijstje van vijf ids ('gemini', 'openrouter', 'groq',
 * 'xai', 'ollama') dat uit de gezondheidscheck las, terwijl Instellingen uit
 * de providercatalogus las. Twee plekken die hetzelfde horen te tonen met een
 * andere inhoud, en dan weet je bij een verschil niet meer welke van de twee
 * je moet geloven.
 *
 * Nu leest deze balk dezelfde catalogus en dezelfde standregels als de kaarten
 * op Instellingen. De vorm verschilt -- daar een raster, hier regels -- maar
 * de bron en de woorden zijn gelijk.
 */
import { useEffect, useState, useCallback } from 'react';
import { PROVIDER_KEY_CATALOGUE } from '@/domain/providerCatalogue';
import { standTekst, standKleur, type KaartStand } from '@/domain/providerCardStand';
import type { ProviderConn } from '@/domain/providerConnections';
import { providerIcoon } from '@/presentation/components/settings/providerIcoon';

const VERVERS_MS = 60_000;

interface Regel {
  id: string;
  naam: string;
  icoonNaam: string;
  accent: string;
  stand: KaartStand;
  ingesteld: boolean;
  model: string;
}

/** Leest wat er in de app bekend is over elke provider. Geen eigen meting: de
 *  kaarten op Instellingen schrijven hun testuitslag weg, en die lezen we hier
 *  terug -- anders krijg je twee metingen die het oneens kunnen zijn. */
function leesRegels(): Regel[] {
  // Dezelfde opslag die Instellingen schrijft. Eén sleutel, één waarheid --
  // een tweede meting hier zou met die van de kaarten kunnen botsen.
  let conns: Record<string, ProviderConn> = {};
  try {
    conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
  } catch {
    // Onleesbare opslag betekent 'niets bekend', niet 'alles stuk'.
  }
  return PROVIDER_KEY_CATALOGUE.map(p => {
    const conn = conns[p.id] ?? {};
    const ruw = conn.lastTest;
    const stand: KaartStand = ruw === 'ok' || ruw === 'fail' || ruw === 'testing' ? ruw : 'idle';
    return {
      id: p.id,
      naam: p.name,
      icoonNaam: p.icon,
      accent: p.accent,
      stand,
      ingesteld: !p.needsKey || !!conn.key,
      model: conn.model || p.defaultModel,
    };
  });
}

export function ModelStatusWidget() {
  const [regels, setRegels] = useState<Regel[]>(() => leesRegels());

  const ververs = useCallback(() => { setRegels(leesRegels()); }, []);

  useEffect(() => {
    // Niet meteen ververs() aanroepen: de beginstand komt al uit de lazy
    // initializer van useState, dus een synchrone setState hier zou alleen een
    // tweede render veroorzaken met precies dezelfde inhoud.
    const t = window.setInterval(ververs, VERVERS_MS);
    // Een test op Instellingen verandert de opslag; dan hoort deze balk mee te
    // veranderen zonder dat je een minuut wacht.
    window.addEventListener('storage', ververs);
    return () => { window.clearInterval(t); window.removeEventListener('storage', ververs); };
  }, [ververs]);

  const werkend = regels.filter(r => r.stand === 'ok').length;
  const stuk = regels.filter(r => r.stand === 'fail').length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-axe-meta" style={{ color: 'var(--text-muted)' }}>
          {regels.length} providers
        </span>
        <span className="text-axe-meta" style={{ color: stuk > 0 ? 'var(--m-broken)' : 'var(--text-muted)' }}>
          {werkend} connected{stuk > 0 ? ` · ${stuk} failed` : ''}
        </span>
      </div>

      {regels.map(r => {
        const Icoon = providerIcoon(r.icoonNaam);
        const kleur = standKleur(r.stand, r.ingesteld);
        return (
          <div key={r.id} className="flex items-center justify-between gap-2 py-[3px]">
            <div className="flex items-center gap-2 min-w-0">
              <Icoon size={11} style={{ color: r.accent }} className="shrink-0" />
              <span className="text-axe-meta truncate" style={{ color: 'var(--text-secondary)' }}>
                {r.naam}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-axe-meta" style={{ color: kleur }}>
                {standTekst(r.stand, r.ingesteld)}
              </span>
              <span className="w-[6px] h-[6px] rounded-full block" style={{ background: kleur }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
