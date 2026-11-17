/**
 * Wacht op jou — de ene plek met alles wat Luka's ja of nee nodig heeft.
 * Uitleg en bronnen: src/domain/approvals/wachtOpJou.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ExternalLink, Mail, RefreshCw, Send, X } from 'lucide-react';
import { hoeLang, type WachtItem } from '@/domain/approvals/wachtOpJou';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';
import { northseaActie, northseaMensGoedkeuren } from '@/infrastructure/gateways/axeCoreApiService';

type Concept = { to?: string; subject?: string; body?: string };

async function leesConcept(approvalId: string): Promise<Concept> {
  const { result } = await northseaActie('get_approval', { approval_id: approvalId });
  const d = (result as { draft?: Concept }).draft ?? {};
  return { to: d.to, subject: d.subject, body: d.body };
}

const VERVERS_MS = 60_000;

function Rij({ item, onBesluit, onOpen, onVerstuur }: {
  item: WachtItem;
  onBesluit: (i: WachtItem, ja: boolean) => void;
  onOpen: (i: WachtItem) => void;
  onVerstuur: (i: WachtItem) => void;
}) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [leest, setLeest] = useState(false);
  const toon = async () => {
    if (concept) { setConcept(null); return; }
    if (!item.approvalId) return;
    setLeest(true);
    try { setConcept(await leesConcept(item.approvalId)); } catch { setConcept({ body: 'Kon de tekst nu niet lezen.' }); }
    setLeest(false);
  };
  return (
    <li className="rounded-xl p-3" style={{ background: 'var(--axe-barbtn, rgba(255,255,255,0.04))' }} data-wacht-bron={item.bron}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: 'rgba(255,255,255,0.06)' }}>{item.app}</span>
        <span>{item.wie}</span>
        {item.sinds && <span>· wacht {hoeLang(item.sinds)}</span>}
      </div>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.wat}</div>
      <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{item.waarom}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {item.kanHierBeslissen ? (
          <>
            <button type="button" onClick={() => onBesluit(item, true)}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
              <Check size={13} /> Ja
            </button>
            <button type="button" onClick={() => onBesluit(item, false)}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <X size={13} /> Nee
            </button>
          </>
        ) : item.kanVersturen ? (
          <>
            <button type="button" onClick={() => onVerstuur(item)}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
              <Send size={13} /> Versturen
            </button>
            <button type="button" onClick={() => void toon()}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
              <Mail size={13} /> {concept ? 'Verberg mail' : leest ? 'Lezen…' : 'Lees mail'}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onOpen(item)}
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
            <ExternalLink size={13} /> Open in de desk
          </button>
        )}
      </div>
      {concept && (
        <div className="mt-2 rounded-lg p-2 text-[12.5px]" style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)' }}>
          {concept.to && <div style={{ color: 'var(--text-secondary)' }}>Aan: {concept.to}</div>}
          {concept.subject && <div className="mb-1 font-semibold">{concept.subject}</div>}
          <div style={{ whiteSpace: 'pre-wrap' }}>{concept.body}</div>
        </div>
      )}
    </li>
  );
}

export default function WachtOpJou() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WachtItem[] | null>(null);
  const [fouten, setFouten] = useState<string[]>([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const haal = useCallback(async () => {
    setBezig(true);
    const r = await haalWachtOpJou();
    setItems(r.items);
    setFouten(r.fouten);
    setBezig(false);
  }, []);

  useEffect(() => {
    const eerste = setTimeout(() => { void haal(); }, 0);
    const t = setInterval(() => { if (!document.hidden) void haal(); }, VERVERS_MS);
    return () => { clearTimeout(eerste); clearInterval(t); };
  }, [haal]);

  const besluit = async (i: WachtItem, ja: boolean) => {
    if (!i.taskId) return;
    try {
      await beslisApproval(i.taskId, i.id.replace(/^axe:/, ''), ja, ja ? 'Approved by Luka (Wacht op jou).' : 'Declined by Luka (Wacht op jou).');
      setItems((oud) => (oud ?? []).filter((x) => x.id !== i.id));
      setMelding(ja ? 'Goedgekeurd.' : 'Afgewezen.');
    } catch (e) {
      setMelding(`Lukte niet: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const verstuur = async (lijst: WachtItem[]) => {
    const ids = lijst.map((i) => i.approvalId).filter((x): x is string => Boolean(x));
    if (!ids.length) return;
    if (ids.length > 1 && !window.confirm(`${ids.length} mails versturen? Ze gaan echt naar de tegenpartijen.`)) return;
    setMelding(ids.length > 1 ? `${ids.length} mails versturen…` : 'Versturen…');
    try {
      const r = await northseaMensGoedkeuren(ids);
      const mis = r.results.filter((x) => !x.ok);
      const weg = new Set(r.results.filter((x) => x.ok).map((x) => x.draft_id));
      setItems((oud) => (oud ?? []).filter((x) => !(x.approvalId && weg.has(x.approvalId))));
      setMelding(mis.length
        ? `${r.sent} verstuurd; ${mis.length} niet: ${mis[0].message ?? mis[0].code}`
        : `${r.sent} verstuurd.`);
    } catch (e) {
      setMelding(`Lukte niet: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const open = (i: WachtItem) => navigate(i.dealId ? `/northsea?deal=${encodeURIComponent(i.dealId)}` : '/northsea');

  const axe = (items ?? []).filter((i) => i.bron === 'axe');
  const ns = (items ?? []).filter((i) => i.bron === 'northsea');
  const verstuurbaar = ns.filter((i) => i.kanVersturen);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4" data-axe-wacht-op-jou="">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Wacht op jou{items ? ` · ${items.length}` : ''}
            </h1>
            <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              Alles wat een ja of nee van jou nodig heeft, uit alle managers en apps. Staat het hier niet, dan wacht het niet op jou.
            </p>
          </div>
          <button type="button" onClick={() => void haal()} disabled={bezig} title="Vernieuwen"
            className="rounded-md p-2" style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
            <RefreshCw size={14} className={bezig ? 'animate-spin' : ''} />
          </button>
        </div>
        {fouten.length > 0 && (
          <p className="mb-2 text-[12px]" style={{ color: 'rgb(251,146,60)' }}>
            Kon {fouten.join(' en ')} nu niet lezen; deze lijst is dus mogelijk niet compleet.
          </p>
        )}
        {melding && <p className="mb-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{melding}</p>}
        {items === null ? (
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Ophalen…</p>
        ) : items.length === 0 && fouten.length === 0 ? (
          <p className="text-[14px]" style={{ color: 'var(--text-primary)' }}>Niets wacht op jou. De managers handelen de rest zelf af.</p>
        ) : (
          <>
            {axe.length > 0 && (
              <section className="mb-4">
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  AXE Core · {axe.length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {axe.map((i) => <Rij key={i.id} item={i} onBesluit={besluit} onOpen={open} onVerstuur={(x) => void verstuur([x])} />)}
                </ul>
              </section>
            )}
            {ns.length > 0 && (
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    NorthSea · {ns.length}
                  </h2>
                  {verstuurbaar.length > 1 && (
                    <button type="button" onClick={() => void verstuur(verstuurbaar)}
                      className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
                      style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                      <Send size={13} /> Alle {verstuurbaar.length} mails versturen
                    </button>
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {ns.map((i) => <Rij key={i.id} item={i} onBesluit={besluit} onOpen={open} onVerstuur={(x) => void verstuur([x])} />)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
