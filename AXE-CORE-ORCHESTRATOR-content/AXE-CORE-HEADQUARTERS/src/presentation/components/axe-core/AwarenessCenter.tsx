import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock3, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getAwarenessSnapshot, type AwarenessSnapshot } from '@/application/awareness/axeAwareness';

type Proposal = { title: string; priority: 'high' | 'normal'; context: string };

/** Read-only live snapshot of open tasks/follow-ups AXE is tracking, with an
 *  "pick this up" affordance that hands a proposal to the caller — approval
 *  happens in the caller (Home routes it through the normal chat pipeline,
 *  so it stays subject to the same approval gates as any other AXE action). */
export function AwarenessCenter({ onClose, onApprove }: { onClose: () => void; onApprove: (proposal: Proposal) => void }) {
  const [data, setData] = useState<AwarenessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const refresh = async () => { setLoading(true); setData(await getAwarenessSnapshot()); setLoading(false); };
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="absolute top-14 right-4 z-30 w-[min(360px,calc(100%-2rem))] rounded-2xl p-4 shadow-2xl"
      style={{ background: 'rgba(8,10,18,.96)', border: '1px solid rgba(34,211,238,.28)', backdropFilter: 'blur(18px)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={15} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-sm font-semibold text-white">Awareness Center</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refresh()} aria-label="Refresh" className="text-gray-400 hover:text-white">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-xs text-gray-400 py-5 text-center">Live context ophalen…</div>
      ) : data && (
        <>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] mb-4">
            {([['Open', data.openTasks], ['Overdue', data.overdueTasks], ['Follow-ups', data.followUps]] as const).map(([label, value]) => (
              <div key={label} className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,.05)' }}>
                <div className="text-lg font-mono text-white">{value}</div>
                <div className="text-[10px] text-gray-400">{label}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-1">
            <Clock3 size={11} /> {new Date(data.now).toLocaleString()}
          </div>
          {data.alerts.length ? (
            <div className="space-y-2">
              {data.alerts.map((a, i) => (
                <div key={i} className="rounded-lg p-2" style={{ background: 'rgba(251,146,60,.1)', color: '#fdba74' }}>
                  <div className="flex gap-2 items-start">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span className="text-xs">{a}</span>
                  </div>
                  <button
                    onClick={() => setProposal({ title: 'Signaal oppakken', priority: data.overdueTasks ? 'high' : 'normal', context: a })}
                    className="mt-2 rounded-md px-2 py-1 text-[10px] text-cyan-200 border border-cyan-400/30 hover:bg-cyan-400/10"
                  >
                    Pak dit op
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 items-center text-xs" style={{ color: '#86efac' }}>
              <CheckCircle2 size={14} /> Geen urgente signalen
            </div>
          )}
          {proposal && (
            <div className="mt-3 rounded-xl p-3 border border-cyan-400/30" style={{ background: 'var(--tint-line)' }}>
              <div className="text-xs font-semibold text-cyan-200">
                Proposal created · {proposal.priority === 'high' ? 'High' : 'Normal'} priority
              </div>
              <div className="text-xs text-gray-300 mt-1">{proposal.context}</div>
              <div className="text-[10px] text-gray-500 mt-2">This is only a proposal. Confirm explicitly before AXE runs anything.</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => { onApprove(proposal); setProposal(null); }}
                  className="rounded-md px-2 py-1 text-[10px] text-emerald-200 border border-emerald-400/30 hover:bg-emerald-400/10"
                >
                  Approve
                </button>
                <button onClick={() => setProposal(null)} className="rounded-md px-2 py-1 text-[10px] text-gray-400 border border-white/10 hover:text-white">
                  Reject
                </button>
              </div>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-gray-500">Read-only · AXE does nothing without your approval</div>
        </>
      )}
    </div>
  );
}
