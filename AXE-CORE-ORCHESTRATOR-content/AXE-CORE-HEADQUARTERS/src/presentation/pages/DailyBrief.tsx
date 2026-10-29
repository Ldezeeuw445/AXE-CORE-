/**
 * Daily Brief: wat er gebeurde, over alles, op één pagina.
 *
 * Eerst wat op Luka wacht, dan wat stuk is, dan per helper (Claude, Grok Bot,
 * Cursor, ChatGPT/Codex, de bouwlus, de DAX, Luka zelf) wat er landde, dan
 * wat er live ging, dan de AXE-agenten. Elke regel heeft één kleur met één
 * betekenis; de legenda staat bovenaan zodat niemand hoeft te raden.
 *
 * De secties komen uit domain/dagbrief.ts, de bronnen uit
 * gateways/dagbriefBronnen.ts. Deze pagina toont alleen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Page } from '@/presentation/components/surface/Page';
import { TabRuimte } from '@/presentation/components/layout/tabMaatstaf';
import { maakDagbrief, type BriefKleur, type Dagbrief } from '@/domain/dagbrief';
import { haalDagbriefInvoer } from '@/infrastructure/gateways/dagbriefBronnen';

const KLEUR: Record<BriefKleur, string> = {
  groen: 'var(--success)',
  blauw: 'var(--accent-cyan)',
  geel: 'var(--warning)',
  rood: 'var(--error)',
  grijs: 'var(--text-muted)',
};

const LEGENDA: [BriefKleur, string][] = [
  ['groen', 'done / live'],
  ['blauw', 'running / ready for review'],
  ['geel', 'waits on you'],
  ['rood', 'broken'],
  ['grijs', 'for info'],
];

const VENSTERS = [
  { id: '24h', label: 'Last 24h', uren: 24 },
  { id: '3d', label: '3 days', uren: 72 },
  { id: '7d', label: 'Week', uren: 168 },
] as const;

function Stip({ kleur, groot = false }: { kleur: BriefKleur; groot?: boolean }) {
  const maat = groot ? 10 : 7;
  return <span className="inline-block flex-none rounded-full" style={{ width: maat, height: maat, background: KLEUR[kleur] }} />;
}

export default function DailyBrief() {
  const [venster, setVenster] = useState<(typeof VENSTERS)[number]['id']>('24h');
  const [brief, setBrief] = useState<Dagbrief | null>(null);
  const [bezig, setBezig] = useState(true);
  const [op, setOp] = useState<Date | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  /** Telt de verversknop; > 0 betekent: niet uit de cache van 10 minuten. */
  const [ververst, setVerverst] = useState(0);

  const uren = useMemo(() => VENSTERS.find(v => v.id === venster)?.uren ?? 24, [venster]);

  // De state wordt pas gezet als de bronnen terug zijn (in de .then), niet
  // synchroon in het effect; "bezig" zetten de knoppen zelf.
  useEffect(() => {
    let actief = true;
    const sinds = new Date(Date.now() - uren * 3_600_000).toISOString();
    haalDagbriefInvoer(sinds, { vers: ververst > 0 })
      .then(invoer => {
        if (!actief) return;
        setBrief(maakDagbrief(invoer));
        setOp(new Date());
        setFout(null);
      })
      .catch(e => { if (actief) setFout(String((e as Error)?.message ?? e)); })
      .finally(() => { if (actief) setBezig(false); });
    return () => { actief = false; };
  }, [uren, ververst]);

  const kiesVenster = useCallback((id: (typeof VENSTERS)[number]['id']) => { setBezig(true); setVenster(id); }, []);
  const ververs = useCallback(() => { setBezig(true); setVerverst(n => n + 1); }, []);

  return (
    <TabRuimte vullen>
      <Page
        title="Daily Brief"
        subtitle={op ? `${VENSTERS.find(v => v.id === venster)?.label} · made ${op.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Everything that happened, from every helper'}
        actions={
          <div className="flex items-center gap-1.5">
            {VENSTERS.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => kiesVenster(v.id)}
                className="rounded-button px-2.5 py-1 text-[12px] font-medium"
                style={{
                  background: venster === v.id ? 'var(--tint)' : 'var(--surface-bg)',
                  border: '1px solid var(--tint-line)',
                  color: venster === v.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                }}
              >
                {v.label}
              </button>
            ))}
            <button
              type="button"
              onClick={ververs}
              disabled={bezig}
              aria-label="Refresh"
              className="flex items-center gap-1.5 rounded-button px-2.5 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)', opacity: bezig ? 0.6 : 1 }}
            >
              <RefreshCw size={12} className={bezig ? 'animate-spin' : undefined} />
            </button>
          </div>
        }
      >
        {/* Eigen ondergrond: op een lichte achtergrondfoto was de legenda niet te lezen. */}
        <div
          className="mb-3 inline-flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card px-3 py-1.5 text-[11px]"
          style={{ color: 'var(--text-secondary)', background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}
        >
          {LEGENDA.map(([k, uitleg]) => (
            <span key={k} className="flex items-center gap-1.5"><Stip kleur={k} />{uitleg}</span>
          ))}
        </div>

        {fout && <p className="mb-3 text-[13px]" style={{ color: KLEUR.rood }}>Could not build the brief: {fout}</p>}
        {!brief && !fout && <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Reading GitHub, AXE Core and the VPS…</p>}

        {brief && (
          <>
            <div
              className="mb-3 flex items-center gap-3 rounded-card px-4 py-3"
              style={{ background: 'var(--surface-bg)', border: `1px solid ${KLEUR[brief.kleur]}` }}
            >
              <Stip kleur={brief.kleur} groot />
              <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{brief.kop}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {brief.secties.map(s => (
                <section
                  key={s.id}
                  className="flex min-w-0 flex-col rounded-card px-3.5 pb-3 pt-3"
                  style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${KLEUR[s.kleur]}` }}
                >
                  <header className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{s.titel}</h2>
                    <span className="flex-none text-[11px]" style={{ color: KLEUR[s.kleur] }}>{s.samenvatting}</span>
                  </header>
                  <ul className="flex flex-col gap-1.5">
                    {s.regels.map((r, i) => (
                      <li key={`${s.id}-${i}`} className="flex items-start gap-2">
                        <span className="mt-[5px]"><Stip kleur={r.kleur} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                            {r.link ? (
                              <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                {r.tekst}<ExternalLink size={11} />
                              </a>
                            ) : r.tekst}
                          </span>
                          {r.detail && (
                            <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>{r.detail}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </Page>
    </TabRuimte>
  );
}
