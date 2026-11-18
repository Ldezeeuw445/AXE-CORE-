/**
 * Waiting on you — one inbox for every pending approval.
 * Domain: src/domain/approvals/wachtOpJou.ts, beleid.ts, optimistisch.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ExternalLink, Mail, RefreshCw, Send, X } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { TabRuimte, Kaart, SectieBlok, SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';
import { CATEGORIE_LABEL, type ApprovalCategorie } from '@/domain/approvals/beleid';
import { laadRegels, logBesluit, zetCategorieVrij } from '@/domain/approvals/beleidOpslag';
import { filterItems, hoeLang, type WachtItem } from '@/domain/approvals/wachtOpJou';
import { gelukt, klik, leegStand, mislukt, ververs, type InboxStand } from '@/domain/approvals/optimistisch';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';
import { northseaActie, northseaMensBeslis } from '@/infrastructure/gateways/axeCoreApiService';

type Concept = { to?: string; subject?: string; body?: string };

async function leesConcept(approvalId: string): Promise<Concept> {
  const { result } = await northseaActie('get_approval', { approval_id: approvalId });
  const d = (result as { draft?: Concept }).draft ?? {};
  return { to: d.to, subject: d.subject, body: d.body };
}

async function voerUit(item: WachtItem, actie: 'approve' | 'reject' | 'send'): Promise<void> {
  if (item.bron === 'axe') {
    if (!item.taskId) throw new Error('Missing task.');
    await beslisApproval(item.taskId, item.id.replace(/^axe:/, ''), actie !== 'reject',
      actie === 'reject' ? 'Declined by Luka (inbox).' : 'Approved by Luka (inbox).');
    return;
  }
  if (!item.approvalId) throw new Error('Missing draft.');
  const r = await northseaMensBeslis([item.approvalId], actie);
  const eerste = r.results[0];
  if (!eerste?.ok) throw new Error(eerste?.message ?? eerste?.code ?? 'NorthSea refused.');
}

async function verstuurNaGoedkeuren(approvalId: string): Promise<string | null> {
  try {
    const r = await northseaMensBeslis([approvalId], 'send');
    const eerste = r.results[0];
    if (eerste?.ok) return null;
    return eerste?.message ?? eerste?.code ?? 'NorthSea refused.';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const VERVERS_MS = 60_000;

function Rij({ item, onBesluit, onOpen }: {
  item: WachtItem;
  onBesluit: (i: WachtItem, actie: 'approve' | 'reject') => void;
  onOpen: (i: WachtItem) => void;
}) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [leest, setLeest] = useState(false);
  const toon = async () => {
    if (concept) { setConcept(null); return; }
    if (!item.approvalId) return;
    setLeest(true);
    try { setConcept(await leesConcept(item.approvalId)); } catch { setConcept({ body: 'Could not read this draft just now.' }); }
    setLeest(false);
  };
  return (
    <li className="rounded-xl p-3" style={{ background: 'var(--axe-barbtn, rgba(255,255,255,0.04))' }}
      data-wacht-bron={item.bron} data-wacht-category={item.category} data-wacht-id={item.id}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: 'rgba(255,255,255,0.06)' }}>{item.app}</span>
        <span>{item.wie}</span>
        <span>· {CATEGORIE_LABEL[item.category]}</span>
        {item.sinds && <span>· waiting {hoeLang(item.sinds)}</span>}
      </div>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.wat}</div>
      <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{item.doet}</div>
      <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{item.waarom}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {item.kanHierBeslissen && (
          <>
            <button type="button" onClick={() => onBesluit(item, 'approve')}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
              <Check size={13} /> Approve
            </button>
            <button type="button" onClick={() => onBesluit(item, 'reject')}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <X size={13} /> Reject
            </button>
          </>
        )}
        {item.approvalId && (
          <button type="button" onClick={() => void toon()}
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
            <Mail size={13} /> {concept ? 'Hide mail' : leest ? 'Reading…' : 'Read mail'}
          </button>
        )}
        {item.dealId && (
          <button type="button" onClick={() => onOpen(item)}
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)' }}>
            <ExternalLink size={13} /> Open deal
          </button>
        )}
      </div>
      {concept && (
        <div className="mt-2 rounded-lg p-2 text-[12.5px]" style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)' }}>
          {concept.to && <div style={{ color: 'var(--text-secondary)' }}>To: {concept.to}</div>}
          {concept.subject && <div className="mb-1 font-semibold">{concept.subject}</div>}
          <div style={{ whiteSpace: 'pre-wrap' }}>{concept.body}</div>
        </div>
      )}
    </li>
  );
}

export default function WachtOpJou() {
  const navigate = useNavigate();
  const [stand, setStand] = useState<InboxStand>(() => leegStand([]));
  const [auto, setAuto] = useState<WachtItem[]>([]);
  const [fouten, setFouten] = useState<string[]>([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const [manager, setManager] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [regels, setRegels] = useState(laadRegels);

  const haal = useCallback(async () => {
    setBezig(true);
    const r = await haalWachtOpJou();
    setStand((oud) => ververs(oud, { pending: r.items, auto: r.auto }));
    setAuto(r.auto);
    setFouten(r.fouten);
    setGeladen(true);
    setBezig(false);
  }, []);

  useEffect(() => {
    const eerste = setTimeout(() => { void haal(); }, 0);
    const t = setInterval(() => { if (!document.hidden) void haal(); }, VERVERS_MS);
    return () => { clearTimeout(eerste); clearInterval(t); };
  }, [haal]);

  const besluit = (i: WachtItem, actie: 'approve' | 'reject') => {
    setStand((oud) => klik(oud, i.id, actie));
    setMelding(actie === 'approve' ? 'Approved.' : 'Rejected.');
    logBesluit({
      itemId: i.id, sourceId: i.approvalId, action: actie, actorType: 'human',
      reason: actie === 'approve' ? 'Approved by Luka in the inbox.' : 'Rejected by Luka in the inbox.',
      via: 'inbox', at: new Date().toISOString(), threadId: i.threadId, messageId: i.messageId,
    });
    void voerUit(i, actie).then(
      async () => {
        setStand((oud) => gelukt(oud, i.id));
        if (actie === 'approve' && i.kanVersturen && i.approvalId) {
          const fout = await verstuurNaGoedkeuren(i.approvalId);
          if (fout) setMelding(`Approved, but send failed: ${fout}`);
        }
      },
      (e: unknown) => {
        setStand((oud) => mislukt(oud, i.id, i));
        setMelding(`Did not stick: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
  };

  const bulk = () => {
    const zichtbaar = filterItems(stand.pending as WachtItem[], {
      manager: manager === 'all' ? undefined : manager,
      category: category === 'all' ? undefined : category,
    }).filter((i) => i.kanHierBeslissen);
    if (!zichtbaar.length) return;
    for (const i of zichtbaar) besluit(i, 'approve');
  };

  const open = (i: WachtItem) => navigate(i.dealId ? `/northsea?deal=${encodeURIComponent(i.dealId)}` : '/northsea');

  const zichtbaar = filterItems(stand.pending as WachtItem[], {
    manager: manager === 'all' ? undefined : manager,
    category: category === 'all' ? undefined : category,
  });
  const managers = useMemo(() => {
    const namen = new Map<string, string>();
    for (const i of [...stand.pending, ...auto]) {
      if (i.managerId) namen.set(i.managerId, i.wie);
    }
    return [...namen.entries()];
  }, [stand.pending, auto]);
  const categories = useMemo(() => {
    const s = new Set<ApprovalCategorie>();
    for (const i of [...stand.pending, ...auto]) {
      if (i.category) s.add(i.category);
    }
    return [...s];
  }, [stand.pending, auto]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-axe-wacht-op-jou="">
      <TabRail kant="links">
        <SchuifBalk groepen={[
          {
            titel: 'Manager',
            items: [
              { id: 'all', label: 'All', actief: manager === 'all', onKies: () => setManager('all') },
              ...managers.map(([id, naam]) => ({
                id, label: naam, actief: manager === id, onKies: () => setManager(id),
              })),
            ],
          },
          {
            titel: 'Category',
            items: [
              { id: 'all', label: 'All', actief: category === 'all', onKies: () => setCategory('all') },
              ...categories.map((c) => ({
                id: c, label: CATEGORIE_LABEL[c], actief: category === c, onKies: () => setCategory(c),
              })),
            ],
          },
        ]} />
      </TabRail>
      <TabRuimte>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-48">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Waiting on you{geladen ? ` · ${stand.pending.length}` : ''}
              </h1>
              <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                Every pending approval from every manager. Approve, reject or bulk-approve here. Routine NorthSea items can be handled by AXE; anything that moves a deal still comes to you.
              </p>
            </div>
            <button type="button" onClick={() => void haal()} disabled={bezig} title="Refresh"
              className="rounded-md p-2" style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
              <RefreshCw size={14} className={bezig ? 'animate-spin' : ''} />
            </button>
          </div>
          {fouten.length > 0 && (
            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              Could not read {fouten.join(' and ')} just now; this list may be incomplete.
            </p>
          )}
          {melding && <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{melding}</p>}

          {!geladen ? (
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
          ) : stand.pending.length === 0 && fouten.length === 0 ? (
            <Kaart>
              <p className="text-[14px]" style={{ color: 'var(--text-primary)' }}>Nothing waiting on you. AXE and the managers handled the rest.</p>
            </Kaart>
          ) : (
            <SectieBlok titel={`Needs you · ${zichtbaar.length}`} extra={zichtbaar.length > 1 ? (
              <button type="button" onClick={bulk}
                className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium"
                style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                <Send size={13} /> Bulk approve {zichtbaar.length}
              </button>
            ) : undefined}>
              <ul className="flex flex-col gap-2">
                {zichtbaar.map((i) => <Rij key={i.id} item={i} onBesluit={besluit} onOpen={open} />)}
              </ul>
            </SectieBlok>
          )}

          {auto.length > 0 && (
            <SectieBlok titel={`AXE handled · ${auto.length}`}>
              <ul className="flex flex-col gap-2">
                {auto.map((i) => (
                  <li key={i.id} className="rounded-xl p-3" style={{ background: 'var(--axe-barbtn, rgba(255,255,255,0.04))' }}
                    data-wacht-auto="">
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {i.wie} · {CATEGORIE_LABEL[i.category]} · {i.beleid?.actorType}
                    </div>
                    <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{i.wat}</div>
                    <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{i.beleid?.reason}</div>
                  </li>
                ))}
              </ul>
            </SectieBlok>
          )}

          <SectieBlok titel="AXE may approve">
            <p className="mb-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              Only you can turn a category fully over to AXE. Defaults stay conservative. Auto-approval is never recorded as human, and it never flips send flags.
            </p>
            <ul className="flex flex-col gap-2">
              {regels.filter((r) => r.managerId === 'northseamgr').map((r) => (
                <li key={r.category} className="flex items-center justify-between gap-3 text-[13px]"
                  style={{ color: 'var(--text-primary)' }}>
                  <span>{CATEGORIE_LABEL[r.category as ApprovalCategorie] ?? r.category}
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>{r.mode}</span>
                  </span>
                  <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={r.axeMayApproveAll}
                      onChange={(e) => {
                        setRegels(zetCategorieVrij(r.managerId, r.category as ApprovalCategorie, e.target.checked));
                        void haal();
                      }} />
                    AXE may approve everything in this category
                  </label>
                </li>
              ))}
            </ul>
          </SectieBlok>
        </div>
      </TabRuimte>
    </div>
  );
}
