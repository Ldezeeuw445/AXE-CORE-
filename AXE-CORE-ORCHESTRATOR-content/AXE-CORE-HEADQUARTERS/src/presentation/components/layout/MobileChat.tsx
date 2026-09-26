/**
 * MobileChat — one readable timeline for Boss, AXE and the agents AXE delegates
 * to. Same canonical conversation store as desktop; this file is presentation.
 */
import { useEffect, useRef } from 'react';
import { AXE_AGENTS, agentById, type AxeAgentId } from '@/domain/agents/roster';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { useVoiceStore, type ConversationMessage } from '@/presentation/store/voiceStore';

function clock(ts: number): string {
  try {
    return new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function delegatedAgent(message: ConversationMessage) {
  const direct = message.delegate;
  if (direct && direct !== 'axe') return agentById(direct);

  if (message.provider === 'tier3' && message.model) {
    const known = AXE_AGENTS.some(agent => agent.id === message.model);
    if (known) return agentById(message.model as AxeAgentId);
  }
  return null;
}

export function MobileChat() {
  const conversation = useVoiceStore((s) => s.conversation);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation.length, voiceStatus]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2"
      style={{ scrollbarWidth: 'none' }}
      aria-label="AXE gesprek"
    >
      <div className="flex flex-col gap-2.5">
        {conversation.map((message, index) => {
          const mine = message.role === 'user';
          const agent = mine ? null : delegatedAgent(message);
          const label = mine ? 'Boss' : (agent?.kort ?? agent?.name ?? 'AXE');
          const accent = mine ? '#22d3ee' : (agent?.accent ?? '#34d399');

          return (
            <div
              key={`${message.timestamp}-${index}`}
              className="flex items-start gap-2"
              data-role={mine ? 'boss' : agent ? 'agent' : 'axe'}
            >
              <div
                className="mt-1 flex size-8 flex-none items-center justify-center"
                aria-hidden="true"
              >
                {agent ? (
                  <div
                    className="grid size-8 place-items-center rounded-[10px]"
                    style={{
                      background: 'rgba(6,9,14,.82)',
                      border: `1px solid ${agent.accent}55`,
                      boxShadow: `0 0 14px ${agent.accent}20`,
                    }}
                  >
                    <ManagerAvatar agent={agent} size={24} />
                  </div>
                ) : (
                  <span
                    className="block size-2.5 rounded-full"
                    style={{
                      background: accent,
                      boxShadow: `0 0 12px ${accent}`,
                    }}
                  />
                )}
              </div>

              <div
                className="min-w-0 flex-1 rounded-[16px] px-3.5 py-2.5"
                style={{
                  background: mine
                    ? 'linear-gradient(135deg, rgba(8,145,178,.13), rgba(8,47,73,.16))'
                    : 'rgba(8,12,18,.70)',
                  border: `1px solid ${mine ? 'rgba(34,211,238,.32)' : agent ? `${agent.accent}2e` : 'rgba(255,255,255,.09)'}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.025)',
                  backdropFilter: 'blur(14px)',
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: accent }}
                  >
                    {label}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {clock(message.timestamp)}
                  </span>
                </div>

                <div
                  className="whitespace-pre-wrap text-[13px] leading-[1.48]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {mine ? message.text : <MarkdownMessage text={message.text} />}
                </div>
              </div>
            </div>
          );
        })}

        {voiceStatus === 'processing' && (
          <div className="flex items-start gap-2">
            <div className="mt-3 flex size-8 flex-none items-center justify-center">
              <span
                className="block size-2.5 rounded-full"
                style={{ background: '#34d399', boxShadow: '0 0 12px #34d399' }}
              />
            </div>
            <div
              className="rounded-[16px] px-3.5 py-2.5 text-[12px]"
              style={{
                background: 'rgba(8,12,18,.70)',
                border: '1px solid rgba(255,255,255,.09)',
                color: 'var(--text-muted)',
              }}
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#34d399' }}>
                AXE
              </div>
              Working…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
