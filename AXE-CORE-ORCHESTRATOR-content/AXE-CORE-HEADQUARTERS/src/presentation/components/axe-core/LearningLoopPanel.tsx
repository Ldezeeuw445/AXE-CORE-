/**
 * Draaien de leerlussen echt rond?
 *
 * ## Waarom dit paneel bestaat
 *
 * Een lus die opent maar nooit sluit, ziet er van buiten precies zo uit als
 * een lus die werkt: er komen rijen bij, er gebeurt iets, de tellers lopen.
 * Alleen verandert er nooit een gewicht. Dat is de storing die deze codebase
 * blijft opleveren -- iets faalt en geeft een geldig ogend, leeg antwoord.
 *
 * Het getal dat telt is daarom niet "hoeveel episodes", maar hoeveel er
 * gesloten zijn. Vandaar dat het aandeel hier groot staat en het aantal klein.
 *
 * ## Twee bronnen, met opzet
 *
 * De chat, de browser en de code-agent lopen via memoryFeedbackService: hun
 * taken zijn binnen minuten klaar, dus localStorage volstaat. Trading gebruikt
 * agent_learning_episodes, want een trade loopt soms dagen door en de
 * autopilot draait op een andere machine dan waar je de uitkomst ziet.
 *
 * Dat verschil is echt en hoort zichtbaar te zijn -- het samenvoegen tot één
 * getal zou verbergen dat de ene helft per apparaat is en de andere niet.
 */
import { useEffect, useState } from 'react';
import { agentLoopHealth } from '@/infrastructure/persistence/agentFeedbackService';
import { feedbackHealth } from '@/infrastructure/persistence/memoryFeedbackService';
import type { LoopHealth } from '@/domain/memory/agentLoop';

/** Wat een agent doet als hij nog nooit iets heeft geleerd. */
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Bar({ value }: { value: number }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--border-subtle)' }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(2, Math.round(value * 100))}%`,
          background: value > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)',
        }}
      />
    </div>
  );
}

export function LearningLoopPanel() {
  const [durable, setDurable] = useState<LoopHealth[] | null>(null);
  const [local, setLocal] = useState(() => feedbackHealth());

  useEffect(() => {
    let alive = true;
    void agentLoopHealth()
      .then(rows => { if (alive) setDurable(rows); })
      .catch(() => { if (alive) setDurable([]); });
    setLocal(feedbackHealth());
    return () => { alive = false; };
  }, []);

  const trading = durable?.find(d => d.agent === 'trading');

  return (
    <div className="widget-card" style={{ borderRadius: 'var(--radius)', padding: 16 }}>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.1em]"
        style={{ color: 'var(--text-muted)' }}
      >
        Leerlussen
      </h3>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Een lus telt pas als een beslissing ook een oordeel terugkrijgt. Wat
        alleen opent, verandert nooit een gewicht — hoeveel rijen er ook
        bijkomen.
      </p>

      {/* ── Duurzaam: trading ─────────────────────────────────────────── */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>Trading</span>
          <span
            className="font-mono text-[13px] tabular-nums"
            style={{ color: trading && trading.closeRate > 0 ? 'var(--success)' : 'var(--text-muted)' }}
          >
            {durable === null ? '…' : trading ? pct(trading.closeRate) : '0%'}
          </span>
        </div>
        <div className="mt-1.5"><Bar value={trading?.closeRate ?? 0} /></div>
        <p className="mt-1.5 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {durable === null
            ? 'laden…'
            : trading && trading.opened > 0
              ? `${trading.closed} van ${trading.opened} beoordeeld · ${trading.good} goed · ${trading.poor} slecht`
              : 'nog geen cyclus gedraaid sinds de lus er is'}
        </p>
      </div>

      {/* ── Per apparaat: chat, browser, code-agent ───────────────────── */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
            Chat, browser en code-agent
          </span>
          <span
            className="font-mono text-[13px] tabular-nums"
            style={{ color: local.judged > 0 ? 'var(--success)' : 'var(--text-muted)' }}
          >
            {local.turns ? pct(local.judged / local.turns) : '0%'}
          </span>
        </div>
        <div className="mt-1.5">
          <Bar value={local.turns ? local.judged / local.turns : 0} />
        </div>
        <p className="mt-1.5 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {local.turns
            ? `${local.judged} van ${local.turns} beoordeeld · ${local.reinforcedMemories} herinneringen versterkt`
            : 'nog geen beurt op dit apparaat'}
        </p>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Deze drie tellen per apparaat en vervallen na 45 minuten — hun taken
          zijn binnen minuten klaar. Trading telt in de database, want een trade
          loopt soms dagen door.
        </p>
      </div>
    </div>
  );
}
