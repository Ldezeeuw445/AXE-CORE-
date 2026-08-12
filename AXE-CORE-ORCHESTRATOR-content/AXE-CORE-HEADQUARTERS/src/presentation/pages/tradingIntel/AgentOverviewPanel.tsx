/**
 * AgentOverviewPanel — one glance at all 3 agents feeding AXE ALGO's
 * decisions: AXE Companion (smart-money intel + correlation), the CrewAI
 * Research crew, and AXE ALGO's own last cycle.
 *
 * Every field here is real, sourced live — no scripted status, no
 * fabricated confidence, no invented "thought chain". Where something
 * genuinely isn't available (Companion's Tauri app not running, no crew
 * report yet, no agent cycle yet), it says so plainly instead of showing a
 * placeholder that looks like data.
 */
import { useEffect, useState } from 'react';
import { BrainCircuit, Gauge, Users, Zap, RefreshCw } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  isCompanionReachable,
  getLatestCompanionCorrelation,
  getIntelFeedHealth,
  type CompanionCorrelation,
  type IntelFeedHealth,
} from '@/infrastructure/gateways/companionToolsService';
import { signalMeta, type TradingDeskState } from './useTradingDeskState';

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function ColumnCard({
  icon,
  accent,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[220px] rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="rounded-lg p-1.5" style={{ color: accent, background: `${accent}18` }}>{icon}</div>
        <div>
          <div className="text-[12px] font-medium" style={{ color: '#F5F0E6' }}>{title}</div>
          <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function AgentOverviewPanel({ desk }: { desk: TradingDeskState }) {
  const { reports, lastTrace, learning } = desk;

  const [companionUp, setCompanionUp] = useState<boolean | null>(null);
  const [correlation, setCorrelation] = useState<CompanionCorrelation | null>(null);
  const [feeds, setFeeds] = useState<IntelFeedHealth[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [up, corr, feedHealth] = await Promise.all([
        isCompanionReachable(),
        getLatestCompanionCorrelation(),
        getIntelFeedHealth(),
      ]);
      setCompanionUp(up);
      setCorrelation(corr);
      setFeeds(feedHealth);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 60_000);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, []);

  const latestReport = reports[0];
  const healthyFeeds = feeds.filter(f => f.healthy).length;

  return (
    <WidgetCard
      title="Agent overview"
      headerAction={
        <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <div className="flex gap-3 flex-wrap">
        <ColumnCard icon={<BrainCircuit size={16} />} accent="#f5b942" title="AXE Companion" subtitle={companionUp == null ? 'checking…' : companionUp ? 'running, same Mac — hosting AXE Intel' : 'not reachable'}>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {companionUp
              ? 'App reachable — smart-money intel, news and economic calendar tools available to research.'
              : 'Companion’s Tauri app isn’t open right now, so AXE Intel (below) is reading whatever it last saved, not live.'}
          </p>
        </ColumnCard>

        <ColumnCard icon={<Gauge size={16} />} accent="#43b9d7" title="AXE Intel" subtitle={feeds.length ? `${healthyFeeds}/${feeds.length} feeds fresh (<2h)` : 'no feed data'}>
          {correlation ? (
            <>
              <div className="text-[11px] leading-snug mb-1" style={{ color: '#F5F0E6' }}>{correlation.title}</div>
              <div className="text-[10px] leading-relaxed line-clamp-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{correlation.summary}</div>
              <div className="flex items-center gap-2 mt-1 mb-2 text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span>{correlation.confidence} confidence</span>
                <span>·</span>
                <span>{timeAgo(correlation.created_at)}</span>
              </div>
            </>
          ) : (
            <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>No correlation analysis yet.</p>
          )}
          <div className="space-y-1 pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {feeds.slice(0, 4).map(f => (
              <div key={f.feedId} className="flex items-center justify-between text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.healthy ? '#34d399' : 'rgba(255,255,255,0.25)' }} />
                  {f.feedId}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{timeAgo(f.lastSyncAt)}</span>
              </div>
            ))}
            {!feeds.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Companion not reachable right now.</p>}
          </div>
        </ColumnCard>

        <ColumnCard icon={<Users size={16} />} accent="#ad7aff" title="Research crew" subtitle={`${reports.length} reports on file`}>
          {latestReport ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: signalMeta(latestReport.signal).color, background: signalMeta(latestReport.signal).bg }}>
                  {signalMeta(latestReport.signal).label}
                </span>
                <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>{latestReport.ticker} · {(latestReport.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="text-[10px] leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{latestReport.thesis || '(no thesis text — proxy report)'}</div>
              <div className="text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{timeAgo(latestReport.createdAt)}</div>
            </>
          ) : (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No research run yet.</p>
          )}
        </ColumnCard>

        <ColumnCard icon={<Zap size={16} />} accent="#ff9d4d" title="AXE Algo" subtitle={learning ? `${learning.tradesClosed} trades closed · ${(learning.winRate * 100).toFixed(0)}% win rate` : 'no history yet'}>
          {lastTrace ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase" style={{ color: '#c4b5fd', background: 'rgba(167,139,250,0.15)' }}>{lastTrace.finalAction}</span>
                <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>{lastTrace.symbol} · {(lastTrace.confidence * 100).toFixed(0)}%</span>
              </div>
              {lastTrace.blockedByRisk && (
                <div className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>Blocked: {lastTrace.blockedByRisk}</div>
              )}
              <div className="text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{timeAgo(lastTrace.createdAt)}</div>
            </>
          ) : (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No cycle run yet.</p>
          )}
        </ColumnCard>
      </div>
    </WidgetCard>
  );
}
