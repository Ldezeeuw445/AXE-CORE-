/**
 * Wat Awareness écht weet: wie iets doet, en welke actie het plan verlaat.
 * Geen tweede layout — dezelfde knoppen als Home: GoedkeuringActie.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { PhoneBlad } from '@/presentation/components/layout/PhoneBlad';
import {
  bewustzijnVanJobs,
  goedkeuringVanActie,
  openGoedkeuringen,
} from '@/domain/agentBewustzijn';
import { getAwarenessSnapshot, type AwarenessGoedkeuring } from '@/application/awareness/axeAwareness';
import { plannerBesluit } from '@/infrastructure/gateways/axeCoreApiService';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { beslisAgentOk, beslisApproval } from '@/application/approvals/beslisAgentOk';

export function AwarenessCenter({
  onClose,
  hoek = 'midden',
}: {
  onClose: () => void;
  hoek?: 'midden' | 'rechts';
}) {
  const jobs = useAxeJobStore((s) => s.jobs);
  const pendingExec = useVoiceStore((s) => s.pendingExec);
  const resolvePendingExec = useVoiceStore((s) => s.resolvePendingExec);
  const server = useServerAgents();
  const mobiel = useIsMobile();
  const [extra, setExtra] = useState<AwarenessGoedkeuring[]>([]);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void getAwarenessSnapshot()
        .then((s) => { if (alive) setExtra(s.goedkeuringen); })
        .catch(() => { if (alive) setExtra([]); });
    };
    laad();
    const id = window.setInterval(laad, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const agenten = bewustzijnVanJobs(jobs).filter((a) => a.regel || a.goedkeuring);
  const uitJobs = openGoedkeuringen(jobs);
  const execVraag = pendingExec
    ? goedkeuringVanActie({ title: pendingExec.title, detail: pendingExec.detail })
    : null;
  const gezien = new Set(uitJobs.map((g) => g.goedkeuring.tekst));
  if (execVraag) gezien.add(execVraag.tekst);
  const uitServer: AwarenessGoedkeuring[] = server.approvals.map((a) => ({
    id: a.task_id,
    tekst: `${a.wat || a.title}${a.waarom || a.detail ? `\n${a.waarom || a.detail}` : ''}\nApprove?`,
    wat: a.wat || a.title,
    waarom: a.waarom || a.detail || '',
    ja: 'Approve',
    taskId: a.task_id,
    approvalId: a.id,
  }));
  const uitTaken = [...extra, ...uitServer].filter((g) => {
    if (gezien.has(g.tekst) || gezien.has(g.approvalId || '')) return false;
    gezien.add(g.tekst);
    if (g.approvalId) gezien.add(g.approvalId);
    return true;
  });

  const stil = agenten.length === 0 && !execVraag && uitJobs.length === 0 && uitTaken.length === 0;
  const rechts = hoek === 'rechts';

  const lijf = (
    <>
      {!mobiel && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <Eye size={13} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Awareness</span>
          </div>
          <button type="button" onClick={onClose} className="text-sm leading-none" style={{ color: 'var(--text-muted)' }} aria-label="Close">×</button>
        </div>
      )}

      {stil && (
        <p className="py-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          Alles stil. Geen goedkeuring, geen lopend werk.
        </p>
      )}

      {agenten.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {agenten.map((a) => (
            <div key={a.agentId} className="rounded-xl px-2.5 py-1.5" style={{ background: 'var(--bg-base)' }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{a.naam}</div>
              <div className="text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>{a.regel}</div>
            </div>
          ))}
        </div>
      )}

      {uitJobs.map((g) => (
        <GoedkeuringActie
          key={`job-${g.job?.id ?? g.agentId}`}
          touch={rechts}
          rijen={[{
            id: g.job?.approvalId || g.goedkeuring.tekst,
            taskId: g.job?.taskId || '',
            wat: g.goedkeuring.wat || g.goedkeuring.tekst,
            waarom: g.goedkeuring.waarom || '',
          }]}
          onBeslis={(rij, akkoord) => {
            const j = g.job;
            void beslisAgentOk({
              akkoord,
              job: j,
              rij: rij.taskId ? rij : null,
              reden: akkoord ? g.goedkeuring.ja : 'geweigerd',
            }).then((ok) => {
              if (ok && j) useAxeJobStore.getState().patch(j.id, { state: akkoord ? 'running' : 'failed' });
              verversServerAgents();
            });
          }}
        />
      ))}

      {execVraag && pendingExec && (
        <GoedkeuringActie
          touch={rechts}
          rijen={[{
            id: pendingExec.id,
            taskId: '',
            wat: execVraag.wat || execVraag.tekst,
            waarom: execVraag.waarom || '',
          }]}
          onBeslis={(_rij, akkoord) => resolvePendingExec(pendingExec.id, akkoord)}
        />
      )}

      {uitTaken.map((g) => (
        <GoedkeuringActie
          key={`taak-${g.approvalId ?? g.id}`}
          touch={rechts}
          rijen={[{
            id: g.approvalId || g.id,
            taskId: g.taskId || '',
            wat: g.wat || g.tekst,
            waarom: g.waarom || '',
          }]}
          onBeslis={(rij, akkoord) => {
            if (g.taskId && g.approvalId) {
              void beslisApproval(g.taskId, g.approvalId, akkoord, akkoord ? g.ja : 'geweigerd').then(verversServerAgents);
              return;
            }
            if (rij.taskId) {
              void beslisAgentOk({ akkoord, rij }).then(verversServerAgents);
              return;
            }
            void plannerBesluit(g.id, akkoord);
          }}
        />
      ))}
    </>
  );

  if (mobiel && typeof document !== 'undefined') {
    return createPortal(
      <PhoneBlad titel="Awareness" onSluit={onClose}>{lijf}</PhoneBlad>,
      document.body,
    );
  }

  return (
    <div
      className={rechts
        ? 'absolute top-full right-0 z-40 mt-2 w-[min(360px,calc(100vw-3rem))] rounded-2xl p-3 shadow-2xl'
        : 'absolute top-full left-1/2 z-40 mt-2 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl p-3 shadow-2xl'}
      style={{
        background: 'var(--axe-kaart-vlak)',
        border: '1px solid var(--axe-kaart-lijn)',
        borderTopColor: 'var(--axe-kaart-lijn-boven)',
        boxShadow: 'var(--axe-kaart-schaduw)',
      }}
      data-axe-awareness
    >
      {lijf}
    </div>
  );
}
