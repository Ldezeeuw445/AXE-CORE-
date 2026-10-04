/**
 * Wat Awareness écht weet: wie iets doet, en welke actie het plan verlaat.
 * Geen tweede layout — dezelfde kaart als de agentvensters. Stil als er niets is.
 */
import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import {
  bewustzijnVanJobs,
  goedkeuringVanActie,
  openGoedkeuringen,
} from '@/domain/agentBewustzijn';
import { getAwarenessSnapshot, type AwarenessGoedkeuring } from '@/application/awareness/axeAwareness';
import { decideDurableTaskApproval, plannerBesluit } from '@/infrastructure/gateways/axeCoreApiService';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export function AwarenessCenter({ onClose }: { onClose: () => void }) {
  const jobs = useAxeJobStore((s) => s.jobs);
  const pendingExec = useVoiceStore((s) => s.pendingExec);
  const resolvePendingExec = useVoiceStore((s) => s.resolvePendingExec);
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
  const uitTaken = extra.filter((g) => !gezien.has(g.tekst));

  const stil = agenten.length === 0 && !execVraag && uitJobs.length === 0 && uitTaken.length === 0;

  return (
    <div
      className="absolute top-full left-1/2 z-40 mt-2 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl p-3 shadow-2xl"
      style={{
        background: 'var(--axe-kaart-vlak)',
        border: '1px solid var(--axe-kaart-lijn)',
        borderTopColor: 'var(--axe-kaart-lijn-boven)',
        boxShadow: 'var(--axe-kaart-schaduw)',
      }}
      data-axe-awareness
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
          <Eye size={13} />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Awareness</span>
        </div>
        <button type="button" onClick={onClose} className="text-sm leading-none" style={{ color: 'var(--text-muted)' }} aria-label="Close">×</button>
      </div>

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
        <GoedkeuringRij
          key={`job-${g.job?.id ?? g.agentId}`}
          tekst={g.goedkeuring.tekst}
          ja={g.goedkeuring.ja}
          onJa={() => {
            const j = g.job;
            if (!j?.taskId || !j.approvalId) return;
            void decideDurableTaskApproval(j.taskId, j.approvalId, true, g.goedkeuring.ja)
              .then(() => useAxeJobStore.getState().patch(j.id, { state: 'running' }));
          }}
          onNee={() => {
            const j = g.job;
            if (!j?.taskId || !j.approvalId) return;
            void decideDurableTaskApproval(j.taskId, j.approvalId, false, 'geweigerd')
              .then(() => useAxeJobStore.getState().patch(j.id, { state: 'failed' }));
          }}
        />
      ))}

      {execVraag && pendingExec && (
        <GoedkeuringRij
          tekst={execVraag.tekst}
          ja={execVraag.ja}
          onJa={() => resolvePendingExec(pendingExec.id, true)}
          onNee={() => resolvePendingExec(pendingExec.id, false)}
        />
      )}

      {uitTaken.map((g) => (
        <GoedkeuringRij
          key={`taak-${g.id}`}
          tekst={g.tekst}
          ja={g.ja}
          onJa={() => { void plannerBesluit(g.id, true); }}
          onNee={() => { void plannerBesluit(g.id, false); }}
        />
      ))}
    </div>
  );
}

function GoedkeuringRij({
  tekst, ja, onJa, onNee,
}: {
  tekst: string;
  ja: string;
  onJa: () => void;
  onNee: () => void;
}) {
  return (
    <div className="mb-2 rounded-xl px-2.5 py-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--axe-kaart-lijn)' }}>
      <p className="mb-2 whitespace-pre-wrap text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>{tekst}</p>
      <div className="flex gap-1.5">
        <button type="button" onClick={onJa} title={ja} className="rounded-lg px-2 py-1 text-[10px]" style={{ color: 'var(--ok)', background: 'var(--tint)' }}>
          Approve
        </button>
        <button type="button" onClick={onNee} className="rounded-lg px-2 py-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          Reject
        </button>
      </div>
    </div>
  );
}
