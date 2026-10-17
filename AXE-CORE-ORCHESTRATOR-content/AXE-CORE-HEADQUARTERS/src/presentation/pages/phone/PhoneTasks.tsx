import { useEffect, useMemo, useState } from 'react';
import { listDurableTasks, type DurableTaskRun } from '@/infrastructure/gateways/axeCoreApiService';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { rijenVanLijst } from '@/domain/agents/pendingApproval';
import { PhoneKaart, PhoneKop, PhoneRij, PhoneSeg } from '@/presentation/pages/phone/phoneUi';

const SEGS = [
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'follow', label: 'Follow-ups' },
  { id: 'alerts', label: 'Alerts' },
] as const;

type Seg = (typeof SEGS)[number]['id'];

function titelVan(row: DurableTaskRun): string {
  return row.title || row.id.slice(0, 8);
}

function dueMs(row: DurableTaskRun): number {
  const due = row.metadata?.dueAt ?? row.metadata?.due_at ?? row.metadata?.due;
  if (typeof due === 'number') return due;
  if (typeof due === 'string') return Date.parse(due);
  return NaN;
}

export default function PhoneTasks({ start = 'open' }: { start?: Seg }) {
  const [seg, setSeg] = useState<Seg>(start);
  const [rows, setRows] = useState<DurableTaskRun[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const server = useServerAgents();
  const rijen = rijenVanLijst(server.approvals);

  useEffect(() => {
    let weg = false;
    void listDurableTasks({ limit: 80 })
      .then((a) => { if (!weg) setRows(a.tasks ?? []); })
      .catch((e) => { if (!weg) setFout(e instanceof Error ? e.message : String(e)); });
    return () => { weg = true; };
  }, []);

  const [nu] = useState(() => Date.now());
  const open = rows.filter((r) => r.status !== 'completed' && r.status !== 'done' && r.status !== 'cancelled');
  const overdue = open.filter((r) => {
    const t = dueMs(r);
    return Number.isFinite(t) && t < nu;
  });
  const follow = open.filter((r) => /follow|wacht|waiting/i.test(`${r.title} ${r.status}`));

  const lijst = useMemo(() => {
    if (seg === 'overdue') return overdue;
    if (seg === 'follow') return follow;
    return open;
  }, [seg, open, overdue, follow]);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app={start === 'alerts' ? 'notifications' : 'tasks'}>
      <PhoneKop title={start === 'alerts' ? 'Notifications' : 'Tasks'} />
      <PhoneSeg items={SEGS} on={seg} onKies={(id) => setSeg(id as Seg)} />
      {fout && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{fout}</p>}

      {seg === 'alerts' ? (
        <PhoneKaart kicker="Waiting on you">
          {rijen.length > 0 ? (
            <GoedkeuringActie
              touch
              rijen={rijen}
              onBeslis={(rij, akkoord) => {
                void beslisAgentOk({
                  akkoord,
                  rij,
                  reden: akkoord ? 'Approved on phone.' : 'Declined on phone.',
                }).then(verversServerAgents);
              }}
            />
          ) : (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No alerts.</div>
          )}
        </PhoneKaart>
      ) : (
        <PhoneKaart kicker={`${lijst.length} items`}>
          {lijst.slice(0, 40).map((r) => (
            <PhoneRij key={r.id} title={titelVan(r)} sub={r.status} />
          ))}
          {lijst.length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing here.</div>}
        </PhoneKaart>
      )}
    </div>
  );
}
