/**
 * Chats: elk gesprek met AXE en de managers op één plek, doorzoekbaar (BOUWLIJST, 25 nov).
 *
 * Bovenaan zoeken over alle gesprekken tegelijk; elke treffer zegt uit welk gesprek,
 * van wie en wanneer, met het zoekwoord gemarkeerd. Zonder zoekvraag: per gesprek de
 * laatste drie regels. Een klik opent dat gesprek (Managers-tab of het AXE-gesprek).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, RefreshCw } from 'lucide-react';
import { Page } from '@/presentation/components/surface/Page';
import { TabRuimte } from '@/presentation/components/layout/tabMaatstaf';
import { chatsOverview, searchChats } from '@/infrastructure/gateways/axeCoreApiService';
import { gesprekKleur, gesprekNaam, markeer, wanneer, type ChatGesprek, type ChatTreffer } from '@/domain/chats';

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
    if (zoek.length >= 2 && treffers) return `${treffers.length} result${treffers.length === 1 ? '' : 's'} for “${zoek}”`;
    if (gesprekken) return `${gesprekken.length} conversations`;
    return 'Every conversation with AXE and the managers';
  }, [zoek, treffers, gesprekken]);

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
              placeholder="Search every conversation…"
              aria-label="Search every conversation"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </label>

          {fout && <p className="mb-3 text-[13px]" style={{ color: 'var(--error)' }}>Could not read the conversations: {fout}</p>}

          {zoek.length >= 2 && treffers && (
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
              {gesprekken.map(g => (
                <button
                  key={`${g.bron}-${g.gesprek_id}`}
                  type="button"
                  onClick={() => open(g.bron, g.gesprek_id)}
                  className="flex min-w-0 flex-col rounded-card px-3.5 pb-3 pt-3 text-left"
                  style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${gesprekKleur(g.gesprek)}` }}
                >
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
              ))}
            </div>
          )}
        </Page>
      </TabRuimte>
    </div>
  );
}
