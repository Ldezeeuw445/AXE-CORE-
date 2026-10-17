import type { ReactNode } from 'react';

export function PhoneKop({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="sr-only">
      <h1>{title}</h1>
      {extra}
    </div>
  );
}

export function PhoneKaart({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <section
      className="mb-2.5 rounded-2xl px-3.5 py-3"
      style={{
        background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
        border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.10))',
        borderTopColor: 'var(--axe-kaart-lijn-boven, rgba(255,255,255,.16))',
        boxShadow: 'var(--axe-kaart-schaduw, 0 8px 30px rgba(0,0,0,.22))',
        color: 'var(--text-primary)',
      }}
    >
      {kicker && (
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
          {kicker}
        </div>
      )}
      {children}
    </section>
  );
}

export function PhoneSeg({
  items, on, onKies,
}: {
  items: ReadonlyArray<{ id: string; label: string }>;
  on: string;
  onKies: (id: string) => void;
}) {
  return (
    <div className="mb-2 mt-1 flex min-w-0 max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-1" role="tablist" style={{ scrollbarWidth: 'none' }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={it.id === on}
          data-axe-seg={it.id}
          onClick={() => onKies(it.id)}
          className="flex min-h-8 shrink-0 items-center rounded-full px-2.5 text-[11px]"
          style={{
            border: `1px solid ${it.id === on ? 'rgba(34,211,238,.4)' : 'var(--axe-kaart-lijn, rgba(255,255,255,.1))'}`,
            color: it.id === on ? '#22d3ee' : 'var(--text-muted)',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function PhoneRij({ title, sub, extra }: { title: string; sub?: string; extra?: ReactNode }) {
  return (
    <div className="flex min-h-[44px] min-w-0 items-center gap-2.5 border-t first:border-t-0" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-[13px] font-semibold leading-snug">{title}</div>
        {sub && <div className="truncate text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
      {extra ? <div className="flex-none shrink-0">{extra}</div> : null}
    </div>
  );
}
