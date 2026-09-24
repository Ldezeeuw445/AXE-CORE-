/**
 * MobileChat — het gesprek op de telefoon.
 *
 * Leest `conversation` uit de voiceStore — dezelfde store die de desktop
 * gebruikt, en die al naar de cloud-providers én het lokale model (Gemma op de
 * Samsung) routeert. Dus dit is puur weergave: geen tweede chat-engine, geen
 * nieuwe verbindingen. Wat je op de home typt komt hier terug, met het antwoord
 * eronder, en offline valt het vanzelf terug op het model op het toestel.
 */
import { useEffect, useRef } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export function MobileChat() {
  const conversation = useVoiceStore((s) => s.conversation);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation.length, voiceStatus]);

  return (
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1 py-2">
      {conversation.map((m, i) => {
        const mine = m.role === 'user';
        return (
          <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[82%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2 text-[13px] leading-relaxed"
              style={
                mine
                  ? { background: 'var(--accent, #38bdf8)', color: '#001018' }
                  : { background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }
              }
            >
              {m.text}
              {!mine && (m.provider || m.model) && (
                <div className="mt-1 text-[10px] opacity-50">
                  {m.model === 'on-device' || m.provider === 'on-device' ? 'via toestel' : (m.model || m.provider)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {voiceStatus === 'processing' && (
        <div className="flex justify-start">
          <div className="rounded-[16px] px-3.5 py-2 text-[13px]" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            AXE denkt na…
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
