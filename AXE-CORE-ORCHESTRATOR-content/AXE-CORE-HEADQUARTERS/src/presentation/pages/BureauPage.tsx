/**
 * Bureau (BOUWLIJST, 26 nov): mappen met links -- sites, tools, methodes --
 * met één regel waarom ze ertoe doen. Gedeeld tussen de apparaten; ook vanuit
 * de chat: "bewaar <link> in <map>: waarom". Weghalen archiveert.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Page } from '@/presentation/components/surface/Page';
import { TabRuimte } from '@/presentation/components/layout/tabMaatstaf';
import { archiveerLink, bewaarLink, haalBureau } from '@/application/axe/bureau';
import { STANDAARD_MAP, domein, perMap, type BureauLink } from '@/domain/bureau';

const vak = { background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' };
const knopStijl = { background: 'var(--tint)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' };
const invoer = 'min-w-0 rounded-button bg-transparent px-2.5 py-1.5 text-[13px] outline-none';

export default function BureauPage() {
  const [links, setLinks] = useState<BureauLink[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState('');
  const [url, setUrl] = useState('');
  const [map, setMap] = useState('');
  const [waarom, setWaarom] = useState('');
  const [ververst, setVerverst] = useState(0);

  useEffect(() => {
    let actief = true;
    setBezig(true);
    haalBureau(true)
      .then((l) => { if (actief) { setLinks([...l]); setFout(null); } })
      .catch((e) => { if (actief) setFout(String(e?.message ?? e)); })
      .finally(() => { if (actief) setBezig(false); });
    return () => { actief = false; };
  }, [ververst]);

  const groepen = useMemo(() => perMap(links ?? [], zoek), [links, zoek]);
  const mappen = useMemo(() => [...new Set((links ?? []).filter((l) => !l.weg).map((l) => l.map))].sort(), [links]);
  const totaal = (links ?? []).filter((l) => !l.weg).length;

  const voegToe = async () => {
    if (!url.trim()) return;
    setBezig(true);
    try {
      await bewaarLink({ url, map, waarom });
      setUrl(''); setWaarom('');
      setLinks([...(await haalBureau())]);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  };

  const haalWeg = async (l: BureauLink) => {
    setBezig(true);
    try { await archiveerLink(l); setLinks([...(await haalBureau())]); } catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setBezig(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-axe-bureau="v1">
      <TabRuimte vullen>
        <Page
          title="Bureau"
          subtitle={links ? `${totaal} link${totaal === 1 ? '' : 's'} in ${mappen.length} folder${mappen.length === 1 ? '' : 's'}` : 'Your links, with why they matter'}
          actions={
            <button type="button" onClick={() => setVerverst((n) => n + 1)} disabled={bezig} aria-label="Refresh"
              className="flex items-center gap-1.5 rounded-button px-2.5 py-1 text-[12px] font-medium" style={{ ...knopStijl, opacity: bezig ? 0.6 : 1 }}>
              <RefreshCw size={12} className={bezig ? 'animate-spin' : undefined} />
            </button>
          }
        >
          <form className="mb-3 flex flex-wrap items-center gap-2 rounded-card px-3 py-2" style={vak}
            onSubmit={(e) => { e.preventDefault(); void voegToe(); }} data-axe-bureau-nieuw>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (resend.com)" aria-label="Link"
              className={`${invoer} flex-[2_1_10rem]`} style={{ color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            <input value={map} onChange={(e) => setMap(e.target.value)} placeholder={`Folder (${STANDAARD_MAP})`} aria-label="Folder" list="axe-bureau-mappen"
              className={`${invoer} flex-[1_1_7rem]`} style={{ color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            <datalist id="axe-bureau-mappen">{mappen.map((m) => <option key={m} value={m} />)}</datalist>
            <input value={waarom} onChange={(e) => setWaarom(e.target.value)} placeholder="Why it matters, in one line" aria-label="Why it matters" maxLength={200}
              className={`${invoer} flex-[3_1_12rem]`} style={{ color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} />
            <button type="submit" disabled={!url.trim() || bezig} className="flex flex-none items-center gap-1 rounded-button px-2.5 py-1.5 text-[12px] font-medium"
              style={{ ...knopStijl, opacity: !url.trim() || bezig ? 0.5 : 1 }}>
              <Plus size={12} /> Add
            </button>
          </form>

          <label className="mb-3 flex items-center gap-2 rounded-card px-3 py-2" style={vak}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Search links, folders, reasons…" aria-label="Search the desk"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
          </label>

          {fout && <p className="mb-3 text-[13px]" style={{ color: 'var(--error)' }} role="alert">{fout}</p>}
          {links && !groepen.length && (
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {zoek ? 'Nothing matches.' : 'Nothing here yet. Add a link above, or tell AXE: "bewaar resend.com in Tools: mail for NorthSea".'}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {groepen.map((g) => (
              <section key={g.map} className="rounded-card px-3.5 py-3" style={vak} data-axe-bureau-map={g.map}>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <FolderOpen size={14} style={{ color: 'var(--accent-cyan)' }} /> {g.map}
                  <span className="text-[11.5px] font-normal" style={{ color: 'var(--text-muted)' }}>{g.links.length}</span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {g.links.map((l) => (
                    <li key={l.id} className="group flex items-start gap-2" data-axe-bureau-link>
                      <div className="min-w-0 flex-1">
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[13px] font-medium hover:underline"
                          style={{ color: 'var(--accent-cyan)' }}>
                          <span className="truncate">{l.titel}</span> <ExternalLink size={11} className="flex-none opacity-60" />
                        </a>
                        <p className="text-[12px]" style={{ color: l.waarom ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                          {l.waarom || <em>No reason yet -- add it again with one line why.</em>}
                        </p>
                        {l.titel !== domein(l.url) && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{domein(l.url)}</p>}
                      </div>
                      <button type="button" onClick={() => void haalWeg(l)} aria-label={`Remove ${l.titel} from the desk`} title="Remove (archived, not deleted)"
                        className="flex-none rounded p-1 opacity-50 hover:opacity-100" style={{ color: 'var(--text-muted)' }}>
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Page>
      </TabRuimte>
    </div>
  );
}
