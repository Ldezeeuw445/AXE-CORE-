/**
 * Het geheugen per agent: welke namespace, hoeveel staat erin, en wat kwam er
 * het laatst bij. Links één agent in detail, rechts de hele lijst om te kiezen
 * — dezelfde kolomlijnen als Activity & plans erboven.
 *
 * Alleen wat er echt is. Gemeten 23 sep 2026: van alle namespaces op deze tab
 * heeft alleen `global` eigen rijen (950); `axe_intel` en `axe_companion`
 * bevatten elk ~4 000 rijen, maar die schreef de trading-desk (deskAgents.ts).
 * Die worden geteld en benoemd, niet getoond als eigen geheugen.
 */
import { useEffect, useMemo, useState } from 'react';
import { Block } from '@/presentation/components/surface/Page';
import {
  memoryOwners, loopAgentFor, relativeTime,
  type MemoryEntryRow, type MemoryOwner,
} from '@/domain/agents/activity';
import { loadNamespaceMemory, type NamespaceCount } from '@/infrastructure/persistence/agentActivityService';
import type { LoopHealth } from '@/domain/memory/agentLoop';

const OWNERS = memoryOwners();

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

function loopFor(owner: MemoryOwner, loopHealth: Record<string, LoopHealth>): LoopHealth | undefined {
  if (owner.kind !== 'core') return undefined;
  const loop = loopAgentFor(owner.agent);
  return loop ? loopHealth[loop] : undefined;
}

export function AgentMemoryPanel({ selectedId, onSelect, counts, loopHealth, stamp, now }: {
  selectedId: string;
  onSelect: (id: string) => void;
  counts: Record<string, NamespaceCount>;
  loopHealth: Record<string, LoopHealth>;
  /** Verandert bij elke geslaagde poll; dan lezen we de detaillijst opnieuw. */
  stamp: number;
  now: number;
}) {
  const owner = useMemo(() => OWNERS.find(o => o.id === selectedId) ?? OWNERS[0], [selectedId]);
  // De lijst draagt zijn namespace mee: kies je een andere agent, dan staat de
  // oude lijst niet even onder de nieuwe naam maar zie je "Reading…".
  const [read, setRead] = useState<{ ns: string; rows: MemoryEntryRow[] | null } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadNamespaceMemory(owner.namespace, 8).then(rows => {
      if (alive) setRead({ ns: owner.namespace, rows });
    });
    return () => { alive = false; };
  }, [owner.namespace, stamp]);

  const current = read?.ns === owner.namespace ? read : null;
  const entries = current ? (current.rows ?? []) : null;
  const readFailed = current != null && current.rows === null;

  const c = counts[owner.namespace];
  const health = loopFor(owner, loopHealth);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-small font-semibold tracking-wide" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
        MEMORY PER AGENT
      </h2>
      <div className="grid gap-3 lg:grid-cols-3" style={{ gridAutoRows: '380px' }}>
        <Block
          className="lg:col-span-2"
          title={<span style={{ color: owner.accent }}>{owner.name}</span>}
          action={<code className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>memory · {owner.namespace}</code>}
        >
          <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <span>
              <b className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(c?.own)}</b> own memories
            </span>
            {c?.desk != null && c.desk > 0 && (
              <span>
                <b className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>{fmt(c.desk)}</b> written here by the Trading desk (not shown)
              </span>
            )}
            <span>
              {health && health.opened > 0 ? (
                <>
                  <b className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(health.opened)}</b> learning episodes ·{' '}
                  <span style={{ color: health.closeRate > 0 ? 'var(--success)' : 'var(--warning)' }}>
                    {Math.round(health.closeRate * 100)}% closed
                  </span>
                </>
              ) : owner.kind === 'crew' ? (
                'learns through Wingman crew runs'
              ) : (
                'no learning episodes yet'
              )}
            </span>
          </div>

          {entries === null ? (
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Reading…</p>
          ) : readFailed ? (
            <p className="text-[12px]" style={{ color: 'var(--error)' }}>
              Could not read <code className="font-mono">{owner.namespace}</code> — a failed read, not an empty memory.
            </p>
          ) : entries.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Nothing of its own in <code className="font-mono">{owner.namespace}</code> yet. It fills when {owner.name} saves
              a memory under this namespace; until then it reads the shared <code className="font-mono">global</code> layer.
            </p>
          ) : (
            <div className="flex flex-col">
              {entries.map(e => {
                const at = e.created_at ? Date.parse(e.created_at) : NaN;
                return (
                  <div key={e.id} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="w-[52px] flex-none font-mono text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                      {e.kind || 'fact'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[12px]" style={{ color: 'var(--text-primary)' }}>
                        {(e.content ?? '').replace(/\s+/g, ' ').trim() || '—'}
                      </p>
                      {e.source && (
                        <p className="truncate font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{e.source}</p>
                      )}
                    </div>
                    <span className="w-[62px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {Number.isFinite(at) ? relativeTime(at, now) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Block>

        <Block
          title="All namespaces"
          action={<span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>own · episodes</span>}
        >
          <div className="flex flex-col">
            {OWNERS.map(o => {
              const on = o.id === owner.id;
              const h = loopFor(o, loopHealth);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onSelect(o.id)}
                  className="flex items-center gap-2 py-1 text-left"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <span className="flex-none rounded-full" style={{ width: 7, height: 7, background: o.accent }} />
                  <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: on ? o.accent : 'var(--text-primary)', fontWeight: on ? 600 : 400 }}>
                    {o.name}
                    {o.kind === 'crew' && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>crew</span>}
                  </span>
                  <span className="w-[58px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: counts[o.namespace]?.own ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {fmt(counts[o.namespace]?.own)}
                  </span>
                  <span className="w-[44px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: h?.opened ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {o.kind === 'crew' ? '·' : fmt(h?.opened ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </Block>
      </div>
    </section>
  );
}
