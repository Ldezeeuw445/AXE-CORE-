import { Clock, CloudSun, Sparkles } from 'lucide-react';
import {
  BROWSER_AI_PROVIDER_LIST,
  type BrowserAIProviderId,
} from '@/domain/browser/browserAIProviders';
import { BrowserAIComposer } from '@/presentation/components/browser/BrowserAIComposer';
import QuickLinksGrid from '@/presentation/components/browser/QuickLinksGrid';
import { Label, Panel } from '@/presentation/components/surface/Surface';
import type { QuickLink } from '@/domain/types/browser';

interface BrowserStartPageProps {
  quickLinks: QuickLink[];
  onNavigate: (url: string, title?: string) => void;
  onAddFavorite: () => void;
  onAIProviderSubmit: (provider: BrowserAIProviderId, message: string, mode?: string) => void;
  loadingProvider?: BrowserAIProviderId | null;
}

function CompactClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const city = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ') ?? 'Local';

  return (
    <Panel inset className="px-3 py-2 flex items-center gap-2 min-h-0">
      <Clock className="w-3.5 h-3.5 text-axe-text-muted shrink-0" />
      <div className="min-w-0">
        <p className="text-surface-body font-medium text-axe-text-primary tabular-nums leading-none">{time}</p>
        <p className="text-axe-meta text-axe-text-muted truncate">{city}</p>
      </div>
    </Panel>
  );
}

function CompactAssistantPromo() {
  return (
    <Panel inset className="px-3 py-2 flex items-center gap-2 min-h-0">
      <Sparkles className="w-3.5 h-3.5 text-axe-accent-cyan shrink-0" />
      <p className="text-axe-meta text-axe-text-secondary leading-tight">Try AXE Assistant</p>
    </Panel>
  );
}

function CompactWeather() {
  return (
    <Panel inset className="px-3 py-2 flex items-center gap-2 min-h-0">
      <CloudSun className="w-3.5 h-3.5 text-axe-semantic-info shrink-0" />
      <p className="text-axe-meta text-axe-text-muted truncate">Weather — configure in settings</p>
    </Panel>
  );
}

export function BrowserStartPage({
  quickLinks,
  onNavigate,
  onAddFavorite,
  onAIProviderSubmit,
  loadingProvider,
}: BrowserStartPageProps) {
  return (
    <div className="h-full w-full overflow-y-auto scrollbar-thin">
      <div className="max-w-[1200px] mx-auto px-5 py-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-button bg-[rgba(34,211,238,.14)] flex items-center justify-center">
            <span className="text-[10px] font-bold text-axe-accent-ice">◆</span>
          </div>
          <span className="text-surface-title font-semibold text-axe-text-primary">AXE Browser</span>
        </div>

        {/* Compact widgets — one tight row */}
        <div className="grid grid-cols-3 gap-2 max-w-xl">
          <CompactClock />
          <CompactAssistantPromo />
          <CompactWeather />
        </div>

        {/* Three composers side by side — no tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {BROWSER_AI_PROVIDER_LIST.map((p) => (
            <BrowserAIComposer
              key={p.id}
              provider={p}
              compact
              isActive
              isLoading={loadingProvider === p.id}
              onFocus={() => {}}
              onSubmit={(msg, mode) => onAIProviderSubmit(p.id, msg, mode)}
            />
          ))}
        </div>

        <div>
          <Label className="mb-2 block">Shortcuts</Label>
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
