import { useState } from 'react';
import { Clock, CloudSun, Sparkles } from 'lucide-react';
import {
  BROWSER_AI_PROVIDER_LIST,
  type BrowserAIProviderId,
} from '@/domain/browser/browserAIProviders';
import { BrowserAIComposer } from '@/presentation/components/browser/BrowserAIComposer';
import QuickLinksGrid from '@/presentation/components/browser/QuickLinksGrid';
import type { QuickLink } from '@/domain/types/browser';

interface BrowserStartPageProps {
  quickLinks: QuickLink[];
  onNavigate: (url: string, title?: string) => void;
  onAddFavorite: () => void;
  onAIProviderSubmit: (provider: BrowserAIProviderId, message: string, mode?: string) => void;
  loadingProvider?: BrowserAIProviderId | null;
}

function ClockWidget() {
  const now = new Date();
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const city = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ') ?? 'Local';

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 flex flex-col items-center justify-center min-h-[100px]">
      <Clock className="w-4 h-4 text-white/30 mb-2" />
      <span className="text-2xl font-light text-white tabular-nums">{time}</span>
      <span className="text-[10px] text-white/40 mt-1">{city}</span>
    </div>
  );
}

function WeatherWidget() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-sky-900/30 to-slate-900/40 p-4 flex flex-col justify-between min-h-[100px] col-span-2">
      <CloudSun className="w-5 h-5 text-sky-300/60" />
      <div>
        <span className="text-3xl font-light text-white">—°</span>
        <p className="text-[11px] text-white/40 mt-1">Weather — configure in settings</p>
      </div>
    </div>
  );
}

function AssistantPromoWidget({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-900/20 to-orange-950/30 p-4 flex flex-col items-center justify-center min-h-[100px] cursor-pointer hover:border-amber-400/20 transition-all group"
    >
      <Sparkles className="w-5 h-5 text-amber-400/60 group-hover:text-amber-400 transition-colors mb-2" />
      <span className="text-[10px] font-medium text-amber-400/70 group-hover:text-amber-400 text-center leading-tight">
        Try AXE Assistant
      </span>
    </button>
  );
}

export function BrowserStartPage({
  quickLinks,
  onNavigate,
  onAddFavorite,
  onAIProviderSubmit,
  loadingProvider,
}: BrowserStartPageProps) {
  const [activeProvider, setActiveProvider] = useState<BrowserAIProviderId>('deepseek');

  return (
    <div className="h-full w-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* AXE branding */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400/30 to-purple-500/20 flex items-center justify-center">
            <span className="text-xs font-bold text-cyan-400">◆</span>
          </div>
          <span className="text-sm font-medium text-white/60">AXE Browser</span>
        </div>

        {/* Provider tabs */}
        <div className="flex gap-2">
          {BROWSER_AI_PROVIDER_LIST.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProvider(p.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                activeProvider === p.id
                  ? 'text-white border'
                  : 'text-white/40 border border-transparent hover:text-white/60'
              }`}
              style={
                activeProvider === p.id
                  ? { backgroundColor: p.accentMuted, borderColor: `${p.accent}40`, color: p.accent }
                  : undefined
              }
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Active composer — full width */}
        {BROWSER_AI_PROVIDER_LIST.map((p) => (
          <div key={p.id} className={activeProvider === p.id ? 'block' : 'hidden'}>
            <BrowserAIComposer
              provider={p}
              isActive
              isLoading={loadingProvider === p.id}
              onFocus={() => setActiveProvider(p.id)}
              onSubmit={(msg, mode) => onAIProviderSubmit(p.id, msg, mode)}
            />
          </div>
        ))}

        {/* Comet-style widget row */}
        <div className="grid grid-cols-4 gap-3">
          <ClockWidget />
          <AssistantPromoWidget onClick={() => setActiveProvider('deepseek')} />
          <WeatherWidget />
        </div>

        {/* Quick links */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-3">Shortcuts</p>
          <QuickLinksGrid
            links={quickLinks}
            onNavigate={onNavigate}
            onAddFavorite={onAddFavorite}
          />
        </div>
      </div>
    </div>
  );
}
