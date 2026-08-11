/**
 * AxeAlgoWidget — the RightPanel's AXE ALGO card: account + open positions
 * at a glance, plus a composer-only chat input. Hitting the expand button
 * (or send while the floating window is already relevant) opens the full
 * floating chat, which stays mounted across the whole app regardless of
 * which page you're on.
 */
import { Maximize2 } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { AxeAlgoChatSurface } from '@/presentation/components/shared/AxeAlgoChatSurface';
import { useAxeAlgoChat } from '@/presentation/hooks/useAxeAlgoChat';
import { useAxeAlgoAccountSnapshot } from '@/presentation/hooks/useAxeAlgoAccountSnapshot';
import { useAxeAlgoWidgetStore } from '@/presentation/store/axeAlgoWidgetStore';

export function AxeAlgoWidget() {
  const snap = useAxeAlgoAccountSnapshot();
  const chat = useAxeAlgoChat();
  const openFloating = useAxeAlgoWidgetStore(s => s.openFloating);

  return (
    <WidgetCard
      title="AXE ALGO"
      headerAction={
        <button type="button" title="Open full chat window" onClick={openFloating} style={{ color: 'var(--text-muted)' }}>
          <Maximize2 size={12} />
        </button>
      }
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide" style={{
            background: snap.isReal ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.08)',
            color: snap.isReal ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
          }}>
            {snap.isReal ? 'MT5 live' : 'Paper'}
          </span>
          <span className="text-[11px] font-mono-data" style={{ color: 'var(--text-secondary)' }}>
            {snap.equity != null ? `${snap.equity.toFixed(0)} ${snap.currency ?? ''}` : snap.loading ? '…' : '—'}
          </span>
        </div>

        <div className="space-y-1 max-h-[100px] overflow-y-auto">
          {snap.positions.length === 0 ? (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{snap.loading ? 'Loading…' : 'Flat — no open positions'}</p>
          ) : snap.positions.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] font-mono-data">
              <span style={{ color: 'var(--text-secondary)' }}>{p.symbol} · {p.side.toUpperCase()} {p.volume}</span>
              {p.profit != null && (
                <span style={{ color: p.profit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>

        <div className="-mx-3 -mb-3">
          <AxeAlgoChatSurface chat={chat} title="AXE ALGO" composerOnly />
        </div>
      </div>
    </WidgetCard>
  );
}
