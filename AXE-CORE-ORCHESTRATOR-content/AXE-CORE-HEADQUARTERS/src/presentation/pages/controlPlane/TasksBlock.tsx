/**
 * De taken die nog iets moeten: wat op jou wacht, wat loopt, wat in de rij
 * staat, en wat de afgelopen week mislukte. Met leeftijd en wie hem heeft.
 *
 * Knoppen alleen waar de server ze ook echt uitvoert (domain/controlPlane.ts,
 * taskActions): akkoord/afwijzen van de planner via /planner/taken/{id}/besluit,
 * van de takenkernel via /tasks/{id}/approvals/{a}/decision, en annuleren via
 * /tasks/{id}/transition. Mislukt is eindstand -- geen "Retry" die niets doet.
 */
import { useMemo, useState } from 'react';
import { detailRegel, korteDuur, taskActions, taskGroup, type TaskAction, type TaskGroup } from '@/domain/controlPlane';
import { decideDurableTaskApproval, plannerBesluit, transitionDurableTask } from '@/infrastructure/gateways/axeCoreApiService';
import { Bevestig, Stand, type Toon } from './bits';
import type { Peiling, TaskData, TaskRow } from './useControlPlaneData';

const GROEPEN: Array<{ id: TaskGroup; label: string; toon: Toon }> = [
  { id: 'needs_you', label: 'Needs you', toon: 'warn' },
  { id: 'active', label: 'Active', toon: 'info' },
  { id: 'waiting', label: 'Waiting', toon: 'muted' },
  { id: 'failed', label: 'Failed · 7d', toon: 'bad' },
];

const STATUS_TOON: Record<string, Toon> = {
  waiting_approval: 'warn', pending: 'muted', queued: 'muted', approved: 'info', blocked: 'warn', retrying: 'warn',
  planning: 'info', running: 'info', in_progress: 'info', verifying: 'info', failed: 'bad',
};

const MAX_RIJEN = 150;

type Uitkomst = { toon: Toon; tekst: string };

function foutVan(t: TaskRow): string {
  const e = t.error;
  if (!e) return '';
  if (typeof e === 'object' && e && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
  return detailRegel(e, 200);
}

export function TasksBlock({ peiling, now }: { peiling: Peiling<TaskData>; now: number }) {
  const [groep, setGroep] = useState<TaskGroup>('needs_you');
  const [zoek, setZoek] = useState('');
  const [uitkomst, setUitkomst] = useState<Record<string, Uitkomst>>({});

  const perGroep = useMemo(() => {
    const m: Record<TaskGroup, TaskRow[]> = { needs_you: [], active: [], waiting: [], failed: [] };
    for (const t of peiling.data?.tasks ?? []) {
      const g = taskGroup(t);
      if (g) m[g].push(t);
    }
    return m;
  }, [peiling.data]);

  const q = zoek.trim().toLowerCase();
  const lijst = perGroep[groep].filter(t => !q || `${t.title ?? ''} ${t.assignee ?? ''} ${t.capability ?? ''} ${t.status}`.toLowerCase().includes(q));
  const perToegewezen = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of perGroep[groep]) m.set(t.assignee || 'unassigned', (m.get(t.assignee || 'unassigned') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [perGroep, groep]);

  const zet = (id: string, u: Uitkomst) => setUitkomst(s => ({ ...s, [id]: u }));

  const doe = async (t: TaskRow, actie: TaskAction, via: 'planner' | 'approval' | null, approvalId: string | null) => {
    try {
      if (actie === 'cancel') {
        const { task } = await transitionDurableTask(t.id, 'cancelled');
        zet(t.id, { toon: 'ok', tekst: `Now ${task.status}` });
      } else if (via === 'planner') {
        const res = await plannerBesluit(t.id, actie === 'approve');
        zet(t.id, { toon: 'ok', tekst: res.goedkeuring === 'ja' ? 'Approved: the Code Agent picks it up next round' : 'Rejected and cancelled' });
      } else if (via === 'approval' && approvalId) {
        const { approval } = await decideDurableTaskApproval(t.id, approvalId, actie === 'approve');
        zet(t.id, { toon: 'ok', tekst: `Approval ${approval.status}` });
      }
      peiling.refresh();
    } catch (e) {
      zet(t.id, { toon: 'bad', tekst: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!peiling.data) {
    return <p className="text-xs" style={{ color: peiling.error ? 'var(--m-broken)' : 'var(--text-muted)' }}>{peiling.error ?? 'Loading tasks…'}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {GROEPEN.map(g => (
          <button key={g.id} type="button" className="cp-keuze" data-aan={groep === g.id ? 'ja' : undefined} onClick={() => setGroep(g.id)}>
            {g.label} <span style={{ color: groep === g.id || perGroep[g.id].length === 0 ? undefined : `var(--m-${g.toon === 'warn' ? 'budget' : g.toon === 'bad' ? 'broken' : 'idle'})` }}>{perGroep[g.id].length}</span>
          </button>
        ))}
        <input className="cp-invoer ml-auto w-40" value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Filter tasks…" />
      </div>
      {perToegewezen.length > 0 && (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {perToegewezen.map(([a, n]) => `${a} ${n}`).join(' · ')}
        </p>
      )}
      {peiling.data.approvalsError && (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--m-budget)' }}>Approvals not readable ({peiling.data.approvalsError}); kernel approvals are read-only until it answers.</p>
      )}

      {lijst.slice(0, MAX_RIJEN).map(t => {
        const approvalId = peiling.data?.approvals[t.id] ?? null;
        const { actions, via, note } = taskActions(t, approvalId);
        const u = uitkomst[t.id];
        const fout = t.status === 'failed' ? foutVan(t) : '';
        return (
          <div key={t.id} className="cp-rij flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="cp-naam text-[12px] leading-snug">{t.title || <span className="cp-zacht">untitled</span>}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <Stand toon={STATUS_TOON[t.status] ?? 'muted'}>{t.status === 'pending' && t.metadata?.goedkeuring === 'nodig' ? 'awaiting approval' : t.status.split('_').join(' ')}</Stand>
                <span>{t.assignee || 'unassigned'}</span>
                {t.capability && <span>{t.capability}</span>}
                <span title={t.created_at}>{korteDuur(t.created_at, now)} old</span>
                {groep === 'active' && t.heartbeat_at && <span>heartbeat {korteDuur(t.heartbeat_at, now)} ago</span>}
                {(t.attempt ?? 0) > 0 && <span>attempt {t.attempt}/{t.max_attempts ?? '?'}</span>}
              </div>
              {fout && <div className="mt-0.5 text-[11px]" style={{ color: 'var(--m-broken)' }}>{fout}</div>}
              {note && !u && <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{note}</div>}
              {u && <div className="mt-0.5 text-[11px]"><Stand toon={u.toon}>{u.tekst}</Stand></div>}
            </div>
            {actions.length > 0 && (
              <div className="flex flex-none items-center gap-1">
                {actions.map(a => (
                  <Bevestig key={a}
                    label={a === 'approve' ? 'Approve' : a === 'reject' ? 'Reject' : 'Cancel task'}
                    vraag={a === 'approve' ? 'Approve?' : a === 'reject' ? 'Reject?' : 'Cancel this task?'}
                    toon={a === 'approve' ? 'ok' : a === 'reject' ? 'bad' : 'muted'}
                    doe={() => doe(t, a, via, approvalId)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {lijst.length > MAX_RIJEN && (
        <p className="pt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Showing the newest {MAX_RIJEN} of {lijst.length}. Filter to narrow down.</p>
      )}
      {lijst.length === 0 && <p className="py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Nothing here.</p>}
    </div>
  );
}
