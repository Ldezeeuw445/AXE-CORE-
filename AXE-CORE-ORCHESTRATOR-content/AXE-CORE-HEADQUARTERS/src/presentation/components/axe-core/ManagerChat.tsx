/**
 * Manager chat over the neural core (Home).
 *
 * Luka okt 2026: not a tiny status card — a real assistant chat (~60%×75%),
 * markdown replies, persisted per manager, multiline composer, mission strip
 * collapsed at the top. Morph/collapse animation stays; AXE core remains the
 * main assistant and this panel collapses back to the brain.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { goedkeuringVanJob } from '@/domain/agentBewustzijn';
import { draadVoorAgent, type DraadBericht } from '@/domain/tierRouter/agentDraad';
import type { AxeAgent } from '@/domain/agents/roster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import { STAND } from '@/presentation/components/axe-core/managerStand';
import { daxRegel, eventTijd, missieVoortgang, serverStand as bepaalServerStand, type ServerAgent } from '@/domain/agents/serverStatus';
import { rijenVoorAgent, wachtOpOk } from '@/domain/agents/pendingApproval';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import type { GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import { followupIsAkkoord, followupIsAfwijzing } from '@/domain/goedkeuringFollowup';
import { taakFoutVan } from '@/domain/taken/taakFout';
import {
  bewaarManagerChat,
  laadManagerChat,
  nieuwMsg,
  type ManagerChatMsg,
} from '@/domain/agents/managerChatOpslag';
import {
  FileUploadButton,
  filesToAttachments,
  formatAttachmentsForPrompt,
  type ChatAttachment,
} from '@/presentation/components/axe-core/FileUploadButton';

function wieEnWat(agent: AxeAgent, job: AxeJob | null): string {
  if (!job) return `AXE has nothing running with ${agent.name} right now.`;
  switch (job.state) {
    case 'queued': return `AXE just handed this to ${agent.name}. It is spinning up.`;
    case 'running': return `AXE handed this to ${agent.name}. It is working on it now.`;
    case 'waiting': return `${agent.name} is waiting on you before it goes any further.`;
    case 'failed': return `${agent.name} ran into something and stopped.`;
    default: return `${agent.name} is finished.`;
  }
}

/** Short, human line — never dump provider JSON into the bubble. */
function vriendelijkeTekst(raw: string, failed: boolean): { text: string; error: boolean } {
  const t = (raw || '').trim();
  if (!t) return { text: '', error: false };
  if (
    failed
    || /every provider failed|waiting for capacity|afkoelend|rate limit|no credits|insufficient_quota/i.test(t)
    || /^\s*\{[\s\S]*"error"/i.test(t)
  ) {
    return { text: taakFoutVan(t).regel, error: true };
  }
  return { text: t, error: false };
}

function draadNaarChat(berichten: DraadBericht[]): ManagerChatMsg[] {
  return berichten.map((b, i) => {
    const failed = b.soort === 'result' && /every provider failed|waiting for capacity|429|no credits/i.test(b.tekst);
    const { text, error } = vriendelijkeTekst(b.tekst, failed || b.soort === 'approval' && false);
    const role: ManagerChatMsg['role'] =
      b.rol === 'luka' || b.soort === 'followup' || b.soort === 'instruction' ? 'user' : 'assistant';
    // Instructions from AXE are shown as assistant context; followups from Luka as user.
    const finalRole: ManagerChatMsg['role'] =
      b.soort === 'followup' ? 'user'
        : b.soort === 'instruction' ? 'user'
          : role === 'user' ? 'user' : 'assistant';
    return {
      id: `draad-${i}-${b.soort}-${b.tekst.slice(0, 24)}`,
      role: finalRole,
      text: error ? text : b.tekst,
      at: i,
      error: error || undefined,
    };
  });
}

function mergeGeschiedenis(lokaal: ManagerChatMsg[], uitJobs: ManagerChatMsg[]): ManagerChatMsg[] {
  const seen = new Set<string>();
  const uit: ManagerChatMsg[] = [];
  const sleutel = (m: ManagerChatMsg) => `${m.role}|${m.text.trim().slice(0, 160)}`;
  for (const m of [...lokaal, ...uitJobs]) {
    const k = sleutel(m);
    if (!m.text.trim() || seen.has(k)) continue;
    seen.add(k);
    uit.push(m);
  }
  return uit.sort((a, b) => a.at - b.at);
}

function TypingDots() {
  return (
    <div
      className="flex items-center gap-1 px-3 py-2 rounded-2xl w-fit"
      style={{ background: 'rgba(34,211,238,.08)', border: '1px solid rgba(34,211,238,.18)' }}
      aria-label="Assistant is typing"
      data-axe-typing
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--accent-cyan)' }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function ManagerChat({
  agent,
  job,
  jobs = [],
  onSluit,
  onOpvolging,
  onGoedkeuring,
  server,
  onMissie,
  extraGoedkeuringen = [],
  tierRegel = '',
}: {
  agent: AxeAgent;
  job: AxeJob | null;
  jobs?: AxeJob[];
  onSluit: () => void;
  onOpvolging?: (tekst: string) => void;
  onGoedkeuring?: (akkoord: boolean) => void;
  extraGoedkeuringen?: Array<{ id: string; task_id?: string; wat?: string | null; waarom?: string | null; title?: string; detail?: string }>;
  server?: ServerAgent;
  onMissie?: (missieId: string, actie: 'pause' | 'resume') => void;
  tierRegel?: string;
}) {
  const sluitRef = useRef<HTMLButtonElement>(null);
  const draadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [opvolging, setOpvolging] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [stripOpen, setStripOpen] = useState(false);
  const [lokaal, setLokaal] = useState<ManagerChatMsg[]>(() => laadManagerChat(agent.id));
  const [wachtOpAntwoord, setWachtOpAntwoord] = useState(false);
  const laatsteJobSamenvatting = useRef<string>('');

  useEffect(() => {
    setLokaal(laadManagerChat(agent.id));
    setWachtOpAntwoord(false);
    laatsteJobSamenvatting.current = '';
    sluitRef.current?.focus();
  }, [agent.id]);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [onSluit]);

  const jobBerichten = useMemo(
    () => draadNaarChat(jobs.length ? draadVoorAgent(jobs, agent.id) : (job ? draadVoorAgent([job], agent.id) : [])),
    [jobs, job, agent.id],
  );

  const berichten = useMemo(() => mergeGeschiedenis(lokaal, jobBerichten), [lokaal, jobBerichten]);

  useEffect(() => {
    bewaarManagerChat(agent.id, berichten);
  }, [agent.id, berichten]);

  // When a running/queued follow-up finishes, fold the result into local history.
  useEffect(() => {
    if (!job) return;
    if (job.state === 'queued' || job.state === 'running') {
      setWachtOpAntwoord(true);
      return;
    }
    if ((job.state === 'done' || job.state === 'failed') && job.summary) {
      const key = `${job.id}:${job.summary.slice(0, 80)}`;
      if (laatsteJobSamenvatting.current === key) {
        setWachtOpAntwoord(false);
        return;
      }
      laatsteJobSamenvatting.current = key;
      const { text, error } = vriendelijkeTekst(job.summary, job.state === 'failed');
      setLokaal((prev) => {
        if (prev.some((m) => m.role === 'assistant' && m.text === text)) return prev;
        return [...prev, nieuwMsg('assistant', text || 'Done.', { error: error || undefined })];
      });
      setWachtOpAntwoord(false);
    }
  }, [job?.id, job?.state, job?.summary]);

  useEffect(() => {
    const el = draadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [berichten.length, wachtOpAntwoord, job?.summary, job?.approvalVraag]);

  const vraag = job?.state === 'waiting' ? goedkeuringVanJob(job) : null;
  const okRijen = rijenVoorAgent(server, extraGoedkeuringen);
  if (job?.taskId && job.approvalId && !okRijen.some((r) => r.id === job.approvalId)) {
    okRijen.unshift({
      id: job.approvalId,
      taskId: job.taskId,
      wat: vraag?.wat || job.approvalVraag || job.title || 'This needs your OK.',
      waarom: vraag?.waarom || '',
    });
  }
  const lokaalStand = job
    ? (job.state === 'waiting' ? STAND.waiting : STAND[job.state])
    : null;
  const serverStand = server ? bepaalServerStand(server) : null;
  const stand = (wachtOpOk(server, job?.state === 'waiting') ? STAND.waiting : lokaalStand)
    ?? (serverStand ? { label: serverStand.label, kleur: serverStand.kleur } : null);
  const missie = server?.mission ?? null;
  const pauzeerbaar = !!missie && ['active', 'monitoring', 'waiting_agent', 'waiting_approval'].includes(missie.status);
  const hervatbaar = !!missie && ['paused', 'blocked', 'human_decision_required'].includes(missie.status);
  const wacht = wachtOpOk(server, job?.state === 'waiting');
  const knopRijen: GoedkeuringsRij[] = okRijen.length ? okRijen : (wacht ? [{
    id: server?.pendingApproval?.id || job?.approvalId || `${agent.id}-ok`,
    taskId: server?.task?.id || job?.taskId || '',
    wat: vraag?.wat || server?.pendingApproval?.wat || server?.pendingApproval?.title || server?.reason || 'A step is waiting for Luka\'s approval.',
    waarom: vraag?.waarom || server?.pendingApproval?.waarom || server?.pendingApproval?.detail || '',
  }] : []);

  const heeftStrip = !!(server && (missie || server.dax_computer || server.events.length > 0 || (server.routines?.length ?? 0) > 0));

  const stuur = () => {
    const basis = opvolging.trim();
    const bijlage = formatAttachmentsForPrompt(attachments);
    const t = (basis + bijlage).trim();
    if (!t || !onOpvolging) return;
    if (wacht && onGoedkeuring && (followupIsAkkoord(basis) || followupIsAfwijzing(basis))) {
      onGoedkeuring(followupIsAkkoord(basis));
      setOpvolging('');
      setAttachments([]);
      return;
    }
    setLokaal((prev) => [...prev, nieuwMsg('user', basis || '(attachment)')]);
    setWachtOpAntwoord(true);
    onOpvolging(t);
    setOpvolging('');
    setAttachments([]);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const typing = wachtOpAntwoord || job?.state === 'queued' || job?.state === 'running';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.72, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.78, y: 8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="pointer-events-auto"
      role="dialog"
      aria-modal="false"
      aria-label={`Chat with ${agent.name}`}
      data-axe-morph-panel="core"
      data-axe-manager-chat="v2"
    >
      <Kaart
        className="axe-manager-chat-kaart"
        style={{
          width: 'min(720px, 60vw)',
          height: 'min(780px, 75vh)',
          maxWidth: '92vw',
          maxHeight: '85vh',
          boxShadow: '0 28px 90px rgba(0,0,0,.6), 0 0 48px rgba(34,211,238,.14)',
          borderColor: 'rgba(34,211,238,.32)',
          background: 'linear-gradient(165deg, rgba(12,16,22,.97), rgba(8,10,14,.98))',
        }}
        titel={
          <span className="flex items-center gap-2 min-w-0">
            <ManagerAvatar agent={agent} size={24} />
            <span className="min-w-0 truncate">
              {agent.name}
              <span className="ml-1.5 font-normal" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                via AXE core{tierRegel ? ` · ${tierRegel}` : ''}
              </span>
            </span>
          </span>
        }
        actie={
          <span className="flex items-center gap-2 flex-shrink-0">
            {stand && (
              <span className="text-[10px] whitespace-nowrap" style={{ color: stand.kleur }}>
                {stand.label}
              </span>
            )}
            <button
              ref={sluitRef}
              type="button"
              onClick={onSluit}
              aria-label="Close"
              className="w-6 h-6 grid place-items-center rounded text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              ×
            </button>
          </span>
        }
      >
        {/* Compact collapsible mission / event strip — not mixed into chat */}
        {heeftStrip && (
          <div
            className="mb-2 rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(34,211,238,.14)', background: 'rgba(0,0,0,.25)' }}
            data-axe-server-agent={server?.agent}
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
              onClick={() => setStripOpen((v) => !v)}
              aria-expanded={stripOpen}
            >
              <span className="text-[9px] tracking-widest uppercase" style={{ color: 'var(--accent-cyan)' }}>
                Mission / status
              </span>
              <span className="flex-1 min-w-0 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {missie?.title
                  || server?.routines?.[0]?.summary
                  || (!job && server && server.status !== 'SLEEPING' ? server.reason : wieEnWat(agent, job))}
              </span>
              {stripOpen ? <ChevronUp size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />}
            </button>
            {stripOpen && server && (
              <div className="px-2.5 pb-2 text-[10.5px] leading-snug flex flex-col gap-0.5">
                {missie && (
                  <p style={{ color: 'var(--text-primary)' }}>
                    {missie.title}
                    <span style={{ color: 'var(--text-muted)' }}>
                      {missieVoortgang(missie) ? ` · ${missieVoortgang(missie)}` : ''}
                      {missie.current_milestone ? ` · ${missie.current_milestone}` : ''}
                    </span>
                  </p>
                )}
                {(server.routines ?? []).slice(0, 4).map((r) => (
                  <p key={r.name} className="truncate" style={{ color: 'var(--text-secondary)' }} title={r.summary}>
                    <span className="text-[9px] tracking-widest uppercase mr-1" style={{ color: r.running ? 'var(--accent-cyan)' : r.failures ? 'var(--err)' : 'var(--text-muted)' }}>
                      {r.running ? 'Running' : r.failures ? 'Retrying' : eventTijd(r.last_run_at)}
                    </span>
                    {r.name}: {r.summary}
                    {r.next_run_at && !r.running ? <span style={{ color: 'var(--text-muted)' }}> · next {eventTijd(r.next_run_at)}</span> : null}
                  </p>
                ))}
                {(server.dax_computer || server.task?.engine || server.task?.model) && (
                  <p style={{ color: 'var(--text-muted)' }}>
                    {server.dax_computer ? (daxRegel(server)?.tekst ?? `Computer ${server.dax_computer}`) : ''}
                    {server.task?.engine ? ` · ${server.task.engine}` : ''}
                    {server.task?.model ? ` · ${server.task.model}` : ''}
                  </p>
                )}
                {server.dax_computer && daxRegel(server)?.blokkade && (
                  <p style={{ color: 'var(--err)' }} title={daxRegel(server)?.blokkade}>
                    <span className="text-[9px] tracking-widest uppercase mr-1">Can&apos;t</span>
                    {daxRegel(server)?.blokkade}
                  </p>
                )}
                {server.events.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 88 }}>
                    {server.events.slice(0, 8).map((e, i) => (
                      <li key={`${e.at}-${i}`} className="truncate" style={{ color: 'var(--text-secondary)' }} title={e.message ?? ''}>
                        <span style={{ color: 'var(--text-muted)' }}>{eventTijd(e.at)} </span>
                        {e.message || e.event_type}
                      </li>
                    ))}
                  </ul>
                )}
                {missie && onMissie && (pauzeerbaar || hervatbaar) && (
                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => onMissie(missie.id, pauzeerbaar ? 'pause' : 'resume')}
                      className="text-[10px] px-2 py-1 rounded-lg"
                      style={{ background: 'var(--tint)', color: pauzeerbaar ? 'var(--text-secondary)' : 'var(--ok)' }}
                    >
                      {pauzeerbaar ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scrollable chat history */}
        <div
          ref={draadRef}
          className="flex-1 min-h-0 flex flex-col gap-2.5 text-[12.5px] leading-relaxed overflow-y-auto pr-1"
          style={{ minHeight: 180 }}
          data-axe-agent-draad
        >
          {berichten.length === 0 && !typing && (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Ask {agent.name} anything — AXE will hand it over.
            </p>
          )}
          {berichten.map((m) => {
            const user = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex ${user ? 'justify-end' : 'justify-start'}`}
                data-axe-chat-role={m.role}
              >
                <div
                  className="max-w-[82%] px-3 py-2 rounded-2xl"
                  style={{
                    background: m.error
                      ? 'rgba(239,68,68,.10)'
                      : user
                        ? 'rgba(34,211,238,.14)'
                        : 'rgba(255,255,255,.04)',
                    border: m.error
                      ? '1px solid rgba(239,68,68,.28)'
                      : user
                        ? '1px solid rgba(34,211,238,.28)'
                        : '1px solid rgba(255,255,255,.06)',
                    color: m.error ? 'var(--err, #f87171)' : 'var(--text-primary)',
                    borderBottomRightRadius: user ? 6 : undefined,
                    borderBottomLeftRadius: user ? undefined : 6,
                  }}
                >
                  {user || m.error ? (
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  ) : (
                    <MarkdownMessage text={m.text} />
                  )}
                </div>
              </div>
            );
          })}
          {typing && <TypingDots />}
        </div>

        {wacht && onGoedkeuring && (
          <div className="mt-2">
            <GoedkeuringActie
              rijen={knopRijen}
              onBeslis={(_rij, akkoord) => onGoedkeuring(akkoord)}
            />
          </div>
        )}

        {/* Multiline composer */}
        <div
          className="mt-2 pt-2 flex flex-col gap-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}
        >
          <div className="flex items-end gap-1.5">
            <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
            <textarea
              ref={composerRef}
              value={opvolging}
              onChange={(e) => setOpvolging(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  stuur();
                }
              }}
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files?.length) {
                  e.preventDefault();
                  void filesToAttachments(files, attachments).then(setAttachments);
                }
              }}
              placeholder="Message… (Enter send · Shift+Enter newline)"
              aria-label="Message"
              rows={2}
              className="flex-1 min-w-0 text-[12.5px] px-3 py-2 rounded-xl outline-none resize-none"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--axe-kaart-lijn)',
                color: 'var(--text-primary)',
                maxHeight: 140,
              }}
            />
            <button
              type="button"
              onClick={stuur}
              disabled={!opvolging.trim() && attachments.length === 0}
              className="text-[11px] px-3 py-2 rounded-xl font-medium disabled:opacity-40"
              style={{ background: 'rgba(34,211,238,.16)', color: 'var(--accent-cyan)' }}
            >
              Send
            </button>
          </div>
          <p className="text-[9px] px-1" style={{ color: 'var(--text-muted)' }}>
            <Paperclip size={9} className="inline mr-1 opacity-70" />
            Attach files optional · chat stays with this manager
          </p>
        </div>
      </Kaart>
    </motion.div>
  );
}
