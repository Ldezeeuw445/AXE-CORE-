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
import { feedbackHealth, turnDossiers } from '@/infrastructure/persistence/memoryFeedbackService';
import type { TurnDossier, TurnVerdict } from '@/infrastructure/persistence/memoryFeedbackService';
import type { LoopHealth } from '@/domain/memory/agentLoop';

/** Wat een agent doet als hij nog nooit iets heeft geleerd. */
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Hoeveel beurten je terugziet. Genoeg om een patroon te zien, kort genoeg
 *  om het paneel niet in een logboek te veranderen. */
const DOSSIER_LIMIET = 6;

const VERDICT_WOORD: Record<TurnVerdict, string> = {
  good: 'goed',
  poor: 'slecht',
  unknown: 'nog geen oordeel',
};

const VERDICT_KLEUR: Record<TurnVerdict, string> = {
  good: 'var(--success)',
  poor: 'var(--text-secondary)',
  unknown: 'var(--text-muted)',
};

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
  const [dossiers, setDossiers] = useState<TurnDossier[] | null>(null);

  useEffect(() => {
    let alive = true;
    void agentLoopHealth()
      .then(rows => { if (alive) setDurable(rows); })
      .catch(() => { if (alive) setDurable([]); });
    // Een lege lijst is hier een geldig antwoord (nog niets opgehaald op dit
    // apparaat); een mislukte lookup zegt het dossier zelf, per beurt.
    void turnDossiers(DOSSIER_LIMIET)
      .then(rows => { if (alive) setDossiers(rows); })
      .catch(() => { if (alive) setDossiers([]); });
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
              : 'no cycle has run since the loop exists'}
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
            : 'no turn on this device yet'}
        </p>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Deze drie tellen per apparaat en vervallen na 45 minuten — hun taken
          zijn binnen minuten klaar. Trading telt in de database, want een trade
          loopt soms dagen door.
        </p>
      </div>

      {/* ── Wat er in de laatste beslissingen ging ─────────────────────── */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
          Wat ging erin
        </span>
        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          De percentages hierboven zeggen dát de lus draait. Dit zegt wát hij
          ophaalde — anders moet je de tellers op hun woord geloven.
        </p>

        {dossiers === null && (
          <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>laden…</p>
        )}
        {dossiers?.length === 0 && (
          <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            no retrieval on this device yet
          </p>
        )}

        {dossiers?.map(d => (
          <div key={d.id} className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {d.query}
              </span>
              <span
                className="shrink-0 font-mono text-[10px]"
                style={{ color: VERDICT_KLEUR[d.verdict] }}
              >
                {VERDICT_WOORD[d.verdict]}
              </span>
            </div>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {d.owner ?? 'chat'} · {d.memories.length} herinnering
              {d.memories.length === 1 ? '' : 'en'}
              {d.applied ? ' · versterkt' : ''}
              {/* Niet opgezocht is iets anders dan niets gevonden. Zonder dit
                  onderscheid leest een beurt zonder database als een beurt
                  waarin alles verdwenen is. */}
              {d.lookup === 'unavailable' ? ' · inhoud niet opgezocht' : ''}
              {d.vanished ? ` · ${d.vanished} sindsdien weg` : ''}
            </p>
            {d.lookup === 'resolved' && d.memories.map(m => (
              <p
                key={m.id}
                className="mt-0.5 truncate pl-2 text-[10px]"
                style={{ color: m.content ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                title={m.content ?? undefined}
              >
                {m.content ?? '— opgeruimd sinds deze beurt'}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
