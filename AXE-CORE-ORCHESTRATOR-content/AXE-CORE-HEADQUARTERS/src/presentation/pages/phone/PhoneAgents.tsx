import { useMemo, useState } from 'react';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { rijenVanLijst } from '@/domain/agents/pendingApproval';
import { PhoneKaart, PhoneKop, PhoneRij, PhoneSeg } from '@/presentation/pages/phone/phoneUi';

const SEGS = [
  { id: 'waiting', label: 'Waiting' },
  { id: 'working', label: 'Working' },
  { id: 'idle', label: 'Idle' },
] as const;

type Seg = (typeof SEGS)[number]['id'];

export default function PhoneAgents() {
  const [seg, setSeg] = useState<Seg>('waiting');
  const server = useServerAgents();
  const rijen = rijenVanLijst(server.approvals);
  const agents = useMemo(() => Object.values(server.agents), [server.agents]);
  const working = agents.filter((a) => a.status === 'WORKING' || a.status === 'VERIFYING' || a.status === 'WAITING_TOOL');
  const idle = agents.filter((a) => !working.includes(a) && a.status !== 'WAITING_APPROVAL');

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="agents">
      <PhoneKop title="Agents" />
      <PhoneSeg items={SEGS} on={seg} onKies={(id) => setSeg(id as Seg)} />

      {seg === 'waiting' && (
        <PhoneKaart kicker="Approve / Decline">
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
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing waiting.</div>
          )}
        </PhoneKaart>
      )}

      {seg === 'working' && (
        <PhoneKaart kicker="Live">
          {working.length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No agent is working.</div>}
          {working.map((a) => (
            <PhoneRij key={a.agent} title={a.agent} sub={a.status} />
          ))}
        </PhoneKaart>
      )}

      {seg === 'idle' && (
        <PhoneKaart kicker="Idle">
          {idle.map((a) => (
            <PhoneRij key={a.agent} title={a.agent} sub={a.status} />
          ))}
        </PhoneKaart>
      )}
    </div>
  );
}
