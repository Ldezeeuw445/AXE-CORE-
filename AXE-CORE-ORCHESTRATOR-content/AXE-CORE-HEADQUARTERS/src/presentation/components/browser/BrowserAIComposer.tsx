import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Globe, Grid3x3, MousePointerClick, Database, Shield, Search } from 'lucide-react';
import type { BrowserAIProviderConfig } from '@/domain/browser/browserAIProviders';

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  grid: Grid3x3,
  globe: Globe,
  mouse: MousePointerClick,
  database: Database,
  shield: Shield,
  search: Search,
};

interface BrowserAIComposerProps {
  provider: BrowserAIProviderConfig;
  isActive: boolean;
  isLoading?: boolean;
  onFocus: () => void;
  onSubmit: (message: string, mode?: string) => void;
}

function ProviderLogo({ id }: { id: string }) {
  if (id === 'deepseek') {
    return (
      <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
        <path d="M8 22c2-6 6-12 8-14 2 2 4 6 4 10 0 2-1 4-3 4s-4-1-6-3c-1 2-2 3-3 3z" fill="#4D6BFE" />
        <path d="M20 8c3 2 5 6 5 10 0 4-2 7-5 8" stroke="#4D6BFE" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'browser-use') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#C8F542]/20 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#C8F542" strokeWidth="2">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
          <path d="M8 12h8M12 8v8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-[#E85D3B]/20 flex items-center justify-center text-lg">
      🦊
    </div>
  );
}

export function BrowserAIComposer({
  provider,
  isActive,
  isLoading,
  onFocus,
  onSubmit,
}: BrowserAIComposerProps) {
  const [value, setValue] = useState('');
  const [activeMode, setActiveMode] = useState(provider.modes?.[0]?.id);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isActive) textareaRef.current?.focus();
  }, [isActive]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed, activeMode);
    setValue('');
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 ${
        isActive
          ? 'border-white/15 bg-white/[0.04] shadow-[0_0_40px_rgba(0,0,0,0.4)]'
          : 'border-white/[0.06] bg-white/[0.02] opacity-70 hover:opacity-90'
      }`}
      onClick={onFocus}
      style={{ borderColor: isActive ? `${provider.accent}40` : undefined }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <ProviderLogo id={provider.id} />
        <div>
          <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
          {isActive && (
            <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{provider.tagline}</p>
          )}
        </div>
      </div>

      {/* Composer body */}
      <form onSubmit={handleSubmit} className="px-4 pb-4">
        <div
          className="rounded-xl border border-white/[0.08] bg-[#0c0c0e] overflow-hidden"
          style={{ boxShadow: isActive ? `0 0 24px ${provider.accentMuted}` : undefined }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={provider.placeholder}
            rows={isActive ? 3 : 1}
            disabled={isLoading}
            className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-white placeholder:text-white/30 outline-none resize-none"
          />

          <div className="flex items-center justify-between px-3 pb-3 gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {provider.modes?.map((mode) => {
                const Icon = mode.icon ? MODE_ICONS[mode.icon] : undefined;
                const selected = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveMode(mode.id); }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                      selected
                        ? 'text-white border'
                        : 'text-white/40 border border-white/[0.08] hover:text-white/60'
                    }`}
                    style={selected ? { backgroundColor: provider.accentMuted, borderColor: `${provider.accent}50`, color: provider.accent } : undefined}
                  >
                    {Icon && <Icon className="w-3 h-3" />}
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={!value.trim() || isLoading}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
              style={{ backgroundColor: provider.accent }}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
