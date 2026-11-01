/**
 * Tasks tab — axe-core-v3 mockup (tasks.html):
 * filters | inbox list | selected detail. Data comes from Tasks.tsx.
 */
import { useMemo, useState, useEffect } from 'react';
import type { AppId } from '@/domain/apps';
import { appMeta } from '@/domain/apps';

export type TasksDeskStatus = 'todo' | 'in-progress' | 'done' | 'blocked';
export type TasksDeskPriority = 'low' | 'medium' | 'high' | 'critical';

export type TasksDeskItem = {
  id: string;
  title: string;
  description?: string;
  status: TasksDeskStatus;
  priority: TasksDeskPriority;
  assignee: string;
  dueAt?: number;
  app: AppId;
};

export type TasksDeskFilter =
  | 'open'
  | 'today'
  | 'managers'
  | 'northsea'
  | 'design'
  | 'done';

type Props = {
  tasks: TasksDeskItem[];
  loading?: boolean;
  initialSelectedId?: string | null;
  onNew: () => void;
  onMarkDone: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
};

const PRIOlabel: Record<TasksDeskPriority, string> = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function isToday(dueAt?: number): boolean {
  if (!dueAt) return false;
  return dueAt >= startOfToday() && dueAt <= endOfToday();
}

function dueLabel(dueAt?: number): string | null {
  if (!dueAt) return null;
  if (isToday(dueAt)) return 'vandaag';
  const d = new Date(dueAt);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function statusBadge(status: TasksDeskStatus): { text: string; tone: string } {
  if (status === 'in-progress') return { text: 'STAGE', tone: 'stage' };
  if (status === 'blocked') return { text: 'WAIT', tone: 'wait' };
  if (status === 'done') return { text: 'DONE', tone: 'done' };
  return { text: 'OPEN', tone: 'open' };
}

function matchesFilter(t: TasksDeskItem, f: TasksDeskFilter): boolean {
  if (f === 'open') return t.status !== 'done';
  if (f === 'done') return t.status === 'done';
  if (f === 'today') return t.status !== 'done' && isToday(t.dueAt);
  if (f === 'northsea') return t.app === 'northsea';
  if (f === 'managers') {
    return /manager|mgr|axe core|projects/i.test(t.assignee) || t.app === 'axe_core';
  }
  if (f === 'design') {
    return /design|ux|companion/i.test(`${t.title} ${t.assignee} ${t.app}`);
  }
  return true;
}

export function TasksDesk({ tasks, loading, initialSelectedId, onNew, onMarkDone, onToggleDone }: Props) {
  const [filter, setFilter] = useState<TasksDeskFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);

  useEffect(() => {
    if (initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  const counts = useMemo(() => {
    const c: Record<TasksDeskFilter, number> = {
      open: 0, today: 0, managers: 0, northsea: 0, design: 0, done: 0,
    };
    for (const t of tasks) {
      (['open', 'today', 'managers', 'northsea', 'design', 'done'] as TasksDeskFilter[]).forEach((f) => {
        if (matchesFilter(t, f)) c[f] += 1;
      });
    }
    return c;
  }, [tasks]);

  const lijst = useMemo(
    () => tasks.filter((t) => matchesFilter(t, filter)),
    [tasks, filter],
  );

  useEffect(() => {
    if (selectedId && !lijst.some((t) => t.id === selectedId)) {
      setSelectedId(lijst[0]?.id ?? null);
    } else if (!selectedId && lijst[0]) {
      setSelectedId(lijst[0].id);
    }
  }, [lijst, selectedId]);

  const selected = lijst.find((t) => t.id === selectedId) ?? null;

  const filters: { id: TasksDeskFilter; label: string }[] = [
    { id: 'open', label: 'Alle open' },
    { id: 'today', label: 'Vandaag' },
    { id: 'managers', label: 'Managers' },
    { id: 'northsea', label: 'NorthSea' },
    { id: 'design', label: 'Design' },
    { id: 'done', label: 'Klaar' },
  ];

  return (
    <div className="axe-tasks-v3" data-axe-tasks-desk="v3">
      <section className="axe-tasks-v3-filters" aria-label="Filters">
        <div className="axe-tasks-v3-label">Filters</div>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="axe-tasks-v3-filter"
            data-on={filter === f.id ? 'ja' : undefined}
            onClick={() => setFilter(f.id)}
          >
            {f.label} · {counts[f.id]}
          </button>
        ))}
        <div className="axe-tasks-v3-grow" />
        <button type="button" className="axe-tasks-v3-new" onClick={onNew}>+ Nieuwe task</button>
      </section>

      <section className="axe-tasks-v3-inbox" aria-label="Inbox">
        <div className="axe-tasks-v3-inbox-kop">
          <span className="axe-tasks-v3-label">Inbox</span>
          {loading && <span className="axe-tasks-v3-chip">Laden…</span>}
        </div>
        <div className="axe-tasks-v3-lijst">
          {lijst.length === 0 && (
            <div className="axe-tasks-v3-leeg">Geen taken in deze filter</div>
          )}
          {lijst.map((t) => {
            const badge = statusBadge(t.status);
            const due = dueLabel(t.dueAt);
            const meta = [PRIOlabel[t.priority], appMeta(t.app).label, due].filter(Boolean).join(' · ');
            const on = selectedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className="axe-tasks-v3-row"
                data-on={on ? 'ja' : undefined}
                onClick={() => setSelectedId(t.id)}
              >
                <span
                  className="axe-tasks-v3-ck"
                  data-on={t.status === 'done' ? 'ja' : undefined}
                  role="checkbox"
                  aria-checked={t.status === 'done'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDone(t.id, t.status !== 'done');
                  }}
                />
                <span className="axe-tasks-v3-row-body">
                  <span className="axe-tasks-v3-title">{t.title}</span>
                  <span className="axe-tasks-v3-meta">{meta}</span>
                </span>
                <span className="axe-tasks-v3-badge" data-tone={badge.tone}>{badge.text}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="axe-tasks-v3-detail" aria-label="Geselecteerd">
        <div className="axe-tasks-v3-label">Geselecteerd</div>
        {!selected ? (
          <div className="axe-tasks-v3-leeg">Selecteer een task</div>
        ) : (
          <>
            <h2 className="axe-tasks-v3-detail-titel">{selected.title}</h2>
            <p className="axe-tasks-v3-detail-desc">
              {selected.description?.trim() || 'Geen beschrijving.'}
            </p>
            <dl className="axe-tasks-v3-kv">
              <div><dt>Status</dt><dd>{selected.status === 'in-progress' ? 'In progress' : selected.status === 'done' ? 'Done' : selected.status === 'blocked' ? 'Blocked' : 'To do'}</dd></div>
              <div><dt>Owner</dt><dd>{selected.assignee}</dd></div>
              <div><dt>Due</dt><dd>{dueLabel(selected.dueAt) ?? '—'}</dd></div>
              <div>
                <dt>Labels</dt>
                <dd>
                  <span className="axe-tasks-v3-chip">{appMeta(selected.app).label}</span>
                  <span className="axe-tasks-v3-chip">{PRIOlabel[selected.priority]}</span>
                </dd>
              </div>
            </dl>
            <div className="axe-tasks-v3-grow" />
            {selected.status !== 'done' && (
              <button
                type="button"
                className="axe-tasks-v3-done"
                onClick={() => onMarkDone(selected.id)}
              >
                Mark done
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
