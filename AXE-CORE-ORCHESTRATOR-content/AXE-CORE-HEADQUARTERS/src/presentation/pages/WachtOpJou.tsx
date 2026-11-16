/**
 * Wacht op jou — de ene plek met alles wat Luka's ja of nee nodig heeft.
 * Uitleg en bronnen: src/domain/approvals/wachtOpJou.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import { hoeLang, type WachtItem } from '@/domain/approvals/wachtOpJou';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';

const VERVERS_MS = 60_000;

function Rij({ item, onBesluit, onOpen }: {
  item: WachtItem;
  onBesluit: (i: WachtItem, ja: boolean) => void;
  onOpen: (i: WachtItem) => void;
}) {
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
        ) : (
          <button type="button" onClick={() => onOpen(item)}
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
            <ExternalLink size={13} /> Open in de desk
          </button>
        )}
      </div>
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

  const open = (i: WachtItem) => navigate(i.dealId ? `/northsea?deal=${encodeURIComponent(i.dealId)}` : '/northsea');

  const axe = (items ?? []).filter((i) => i.bron === 'axe');
  const ns = (items ?? []).filter((i) => i.bron === 'northsea');

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
                  {axe.map((i) => <Rij key={i.id} item={i} onBesluit={besluit} onOpen={open} />)}
                </ul>
              </section>
            )}
            {ns.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  NorthSea · {ns.length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {ns.map((i) => <Rij key={i.id} item={i} onBesluit={besluit} onOpen={open} />)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
