/**
 * Chats: elk gesprek met AXE en de managers op één plek, doorzoekbaar (BOUWLIJST, 25 nov).
 *
 * Bovenaan zoeken over alle gesprekken tegelijk; elke treffer zegt uit welk gesprek,
 * van wie en wanneer, met het zoekwoord gemarkeerd. Zonder zoekvraag: per gesprek de
 * laatste drie regels. Een klik opent dat gesprek (Managers-tab of het AXE-gesprek).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, RefreshCw, Sparkles } from 'lucide-react';
import { Page } from '@/presentation/components/surface/Page';
import { TabRuimte } from '@/presentation/components/layout/tabMaatstaf';
import { askChats, chatSummary, chatsOverview, searchChats } from '@/infrastructure/gateways/axeCoreApiService';
import { gesprekKleur, gesprekNaam, markeer, metBronnen, wanneer, type ChatGesprek, type ChatTreffer } from '@/domain/chats';

function Gemarkeerd({ tekst, q }: { tekst: string; q: string }) {
  return (
    <>
      {markeer(tekst, q).map((d, i) => d.raak
        ? <mark key={i} className="rounded-sm px-0.5" style={{ background: 'var(--tint)', color: 'var(--accent-cyan)' }}>{d.tekst}</mark>
        : <span key={i}>{d.tekst}</span>)}
    </>
  );
}

export default function ChatsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [zoek, setZoek] = useState('');
  const [treffers, setTreffers] = useState<ChatTreffer[] | null>(null);
  const [gesprekken, setGesprekken] = useState<ChatGesprek[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [ververst, setVerverst] = useState(0);
  type Antwoord = Awaited<ReturnType<typeof askChats>>;
  const [antwoord, setAntwoord] = useState<Antwoord | null>(null);
  const [vraagBezig, setVraagBezig] = useState(false);
  const [vraagFout, setVraagFout] = useState<string | null>(null);
  const [samen, setSamen] = useState<Record<string, { bezig?: boolean; tekst?: string | null; fout?: string | null }>>({});

  const vraagAlles = () => {
    const vraag = q.trim();
    if (vraag.length < 3 || vraagBezig) return;
    setVraagBezig(true); setVraagFout(null); setAntwoord(null);
    askChats(vraag)
      .then(r => setAntwoord(r))
      .catch(e => setVraagFout(String(e?.message ?? e)))
      .finally(() => setVraagBezig(false));
  };

  const vatSamen = (id: string) => {
    setSamen(s => ({ ...s, [id]: { bezig: true } }));
    chatSummary(id)
      .then(r => setSamen(s => ({ ...s, [id]: { tekst: r.samenvatting, fout: r.fout ?? null } })))
      .catch(e => setSamen(s => ({ ...s, [id]: { fout: String(e?.message ?? e) } })));
  };

  // Typen wacht 300 ms; pas dan vragen.
  useEffect(() => {
    const t = window.setTimeout(() => setZoek(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let actief = true;
    const klaar = () => { if (actief) setBezig(false); };
    if (zoek.length >= 2) {
      setBezig(true);
      searchChats(zoek)
        .then(r => { if (actief) { setTreffers(r.treffers); setFout(null); } })
        .catch(e => { if (actief) setFout(String(e?.message ?? e)); })
        .finally(klaar);
    } else {
      setTreffers(null);
      setBezig(true);
      chatsOverview()
        .then(r => { if (actief) { setGesprekken(r.gesprekken); setFout(null); } })
        .catch(e => { if (actief) setFout(String(e?.message ?? e)); })
        .finally(klaar);
    }
    return () => { actief = false; };
  }, [zoek, ververst]);

  const open = (bron: 'axe' | 'manager', id: string | null) => {
    if (bron === 'manager' && id) navigate(`/managers?open=${encodeURIComponent(id)}`);
    else navigate('/');
  };

  const kop = useMemo(() => {
    if (antwoord && antwoord.vraag === q.trim()) return 'Answer from every conversation';
    if (zoek.length >= 2 && treffers) return `${treffers.length} result${treffers.length === 1 ? '' : 's'} for “${zoek}”`;
    if (gesprekken) return `${gesprekken.length} conversations`;
    return 'Every conversation with AXE and the managers';
  }, [zoek, treffers, gesprekken, antwoord, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-axe-chats="v1">
      <TabRuimte vullen>
        <Page
          title="Chats"
          subtitle={kop}
          actions={
            <button
              type="button"
              onClick={() => setVerverst(n => n + 1)}
              disabled={bezig}
              aria-label="Refresh"
              className="flex items-center gap-1.5 rounded-button px-2.5 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)', opacity: bezig ? 0.6 : 1 }}
            >
              <RefreshCw size={12} className={bezig ? 'animate-spin' : undefined} />
            </button>
          }
        >
          <label
            className="mb-3 flex items-center gap-2 rounded-card px-3 py-2"
            style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') vraagAlles(); }}
              placeholder="Search, or ask every conversation a question…"
              aria-label="Search every conversation"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              onClick={vraagAlles}
              disabled={q.trim().length < 3 || vraagBezig}
              aria-label="Ask every conversation"
              className="flex flex-none items-center gap-1 rounded-button px-2.5 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)', opacity: q.trim().length < 3 || vraagBezig ? 0.5 : 1 }}
            >
              <Sparkles size={12} className={vraagBezig ? 'animate-pulse' : undefined} /> Ask all
            </button>
          </label>

          {vraagFout && <p className="mb-3 text-[13px]" style={{ color: 'var(--error)' }}>Could not ask: {vraagFout}</p>}
          {antwoord && (
            <section
              className="mb-3 rounded-card px-3.5 py-3"
              data-axe-chats-antwoord
              style={{ background: 'var(--surface-bg)', border: '1px solid var(--tint-line)' }}
            >
              <p className="mb-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Answer from {antwoord.bronnen.length} excerpt{antwoord.bronnen.length === 1 ? '' : 's'}{antwoord.model ? ` · ${antwoord.model}` : ''}
              </p>
              {antwoord.antwoord ? (
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {metBronnen(antwoord.antwoord).map((d, i) => 'n' in d
                    ? (
                      <a key={i} href={`#bron-${d.n}`} className="mx-0.5 rounded-sm px-1 text-[11px] font-semibold"
                        style={{ background: 'var(--tint)', color: 'var(--accent-cyan)' }}>{d.n}</a>
                    )
                    : <span key={i}>{d.tekst}</span>)}
                </p>
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--warning)' }}>
                  {antwoord.bronnen.length ? `No model could answer right now — the sources it would use are below. (${antwoord.fout ?? ''})` : 'I found nothing about this in any conversation.'}
                </p>
              )}
              {antwoord.bronnen.length > 0 && (
                <ol className="mt-3 flex flex-col gap-1.5">
                  {antwoord.bronnen.map(b => (
                    <li key={b.n} id={`bron-${b.n}`}>
                      <button type="button" onClick={() => open(b.bron, b.gesprek_id)} className="flex w-full gap-2 text-left text-[12px] leading-snug">
                        <span className="flex-none font-semibold" style={{ color: 'var(--accent-cyan)' }}>{b.n}</span>
                        <span className="min-w-0 flex-1" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{gesprekNaam(b.gesprek)} · {b.wie === 'Luka' ? 'you' : gesprekNaam(b.wie)} · {wanneer(b.op)} — </span>
                          {b.tekst}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {fout && <p className="mb-3 text-[13px]" style={{ color: 'var(--error)' }}>Could not read the conversations: {fout}</p>}

          {zoek.length >= 2 && treffers && !(antwoord && antwoord.vraag === q.trim() && treffers.length === 0) && (
            treffers.length === 0
              ? <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Nothing found in any conversation.</p>
              : (
                <ul className="flex flex-col gap-2">
                  {treffers.map(t => (
                    <li key={`${t.bron}-${t.id}`}>
                      <button
                        type="button"
                        onClick={() => open(t.bron, t.gesprek_id)}
                        className="flex w-full flex-col gap-1 rounded-card px-3.5 py-2.5 text-left"
                        style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${gesprekKleur(t.gesprek)}` }}
                      >
                        <span className="flex items-baseline justify-between gap-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                          <span className="truncate">
                            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{gesprekNaam(t.gesprek)}</span>
                            {' · '}{t.wie === 'Luka' ? 'you' : gesprekNaam(t.wie)}
                          </span>
                          <span className="flex-none">{wanneer(t.op)}</span>
                        </span>
                        <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                          <Gemarkeerd tekst={t.tekst} q={zoek} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
          )}

          {zoek.length < 2 && gesprekken && (
            <div className="grid gap-3 md:grid-cols-2">
              {gesprekken.map(g => {
                const id = g.bron === 'axe' ? 'AXE' : g.gesprek_id;
                const sv = samen[id];
                return (
                <div
                  key={`${g.bron}-${g.gesprek_id}`}
                  className="flex min-w-0 flex-col rounded-card px-3.5 pb-3 pt-3"
                  style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${gesprekKleur(g.gesprek)}` }}
                >
                <button type="button" onClick={() => open(g.bron, g.gesprek_id)} className="flex min-w-0 flex-col text-left">
                  <span className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{gesprekNaam(g.gesprek)}</span>
                    <span className="flex-none text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {g.deze_week} this week · {wanneer(g.laatst)}
                    </span>
                  </span>
                  <span className="flex flex-col gap-1">
                    {g.laatste_regels.map((r, i) => (
                      <span key={i} className="truncate text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{r.wie === 'Luka' ? 'You' : gesprekNaam(r.wie)}: </span>{r.tekst}
                      </span>
                    ))}
                  </span>
                </button>
                <div className="mt-2 flex flex-col gap-1">
                  {sv?.tekst && sv.tekst.split('\n').filter(Boolean).slice(0, 3).map((r, i) => (
                    <p key={i} className="text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>{r}</p>
                  ))}
                  {sv?.fout && !sv.tekst && <p className="text-[11.5px]" style={{ color: 'var(--warning)' }}>Could not summarise: {sv.fout}</p>}
                  <button
                    type="button"
                    onClick={() => vatSamen(id)}
                    disabled={!!sv?.bezig}
                    className="self-start rounded-button px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: 'var(--tint)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)', opacity: sv?.bezig ? 0.6 : 1 }}
                  >
                    {sv?.bezig ? 'Summarising…' : sv?.tekst ? 'Summarise again' : 'Summarise in 3 lines'}
                  </button>
                </div>
                </div>
                );
              })}
            </div>
          )}
        </Page>
      </TabRuimte>
    </div>
  );
}
