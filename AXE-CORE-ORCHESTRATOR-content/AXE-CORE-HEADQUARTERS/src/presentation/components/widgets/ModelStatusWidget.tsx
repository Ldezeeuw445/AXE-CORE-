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
import { useEffect, useMemo, useState, useCallback } from 'react';
import { PROVIDER_KEY_CATALOGUE } from '@/domain/providerCatalogue';
import { standTekst, standKleur, type KaartStand } from '@/domain/providerCardStand';
import type { ProviderConn } from '@/domain/providerConnections';
import { providerIcoon } from '@/presentation/components/settings/providerIcoon';
import { leesProviderOpslag } from '@/domain/providers';
import { LIVE_VPS_PROVIDERS, meetVpsProviders, type LiveVpsProvider } from '@/application/system/vpsProviderMeting';

const VERVERS_MS = 60_000;
/** Een "Testing…" die zo oud is, is een test die nooit terugkwam (Abonnement en Hermes hingen sinds 17 okt). */
const TESTING_VERLOOPT_MS = 5 * 60_000;

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
function leesRegels(live: Partial<Record<string, KaartStand>> = {}): Regel[] {
  // Dezelfde opslag die Instellingen schrijft. Eén sleutel, één waarheid --
  // een tweede meting hier zou met die van de kaarten kunnen botsen.
  // Onleesbare opslag betekent 'niets bekend', niet 'alles stuk' -- dat
  // vangt leesProviderOpslag af.
  const conns = leesProviderOpslag() as Record<string, ProviderConn>;
  return PROVIDER_KEY_CATALOGUE.map(p => {
    const conn = conns[p.id] ?? {};
    const ruw = conn.lastTest;
    const hangt = ruw === 'testing' && Date.now() - Date.parse(conn.lastTestAt ?? '') > TESTING_VERLOOPT_MS;
    const opgeslagen: KaartStand = hangt ? 'idle' : ruw === 'ok' || ruw === 'fail' || ruw === 'testing' ? ruw : 'idle';
    // De VPS-regels meten we zelf (zie vpsProviderMeting.ts); de rest is wat Instellingen testte.
    const stand: KaartStand = live[p.id] ?? opgeslagen;
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
  const [live, setLive] = useState<Partial<Record<string, KaartStand>>>({});
  // Telt op bij elke ronde en elke opslagwijziging; de regels lezen daarna de opslag opnieuw.
  const [ronde, setRonde] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `ronde` is de aanleiding om de opslag opnieuw te lezen
  const regels = useMemo(() => leesRegels(live), [live, ronde]);

  const ververs = useCallback(() => { setRonde(n => n + 1); }, []);

  // De VPS-regels: elke ronde gemeten; de uitslag gaat over wat Instellingen ooit opsloeg.
  useEffect(() => {
    let weg = false;
    const meet = () => {
      const conns = leesProviderOpslag() as Record<string, ProviderConn>;
      const instelling = Object.fromEntries(LIVE_VPS_PROVIDERS.map(id => [id, { baseUrl: conns[id]?.baseUrl, model: conns[id]?.model }])) as
        Partial<Record<LiveVpsProvider, { baseUrl?: string; model?: string }>>;
      void meetVpsProviders(instelling).then(uit => { if (!weg) setLive(uit); });
    };
    meet();
    const t = window.setInterval(meet, VERVERS_MS);
    return () => { weg = true; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    // Niet meteen ververs() aanroepen: de eerste regels komen al uit useMemo.
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
