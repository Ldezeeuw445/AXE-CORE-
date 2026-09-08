import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Compass, Database, Globe, Grid3x3, MousePointerClick, Search, Shield } from 'lucide-react';
import { Panel } from '@/presentation/components/surface/Surface';
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
  /** Side-by-side home layout — always visible, tighter card. */
  compact?: boolean;
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
      <Compass size={14} />
    </div>
  );
}

export function BrowserAIComposer({
  provider,
  isActive,
  compact = false,
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
    <Panel
      focus={isActive && !compact}
      inset={compact}
      /* Geen opacity-80 meer op de inactieve kaart.
       *
       * Op een doorzichtige plaat betekent 80% dat je er dwars doorheen kijkt
       * -- de kaart wordt vaal en je ziet je bureaublad. Dat een kaart niet
       * actief is, blijkt uit zijn rand en zijn tekstkleur; daar hoeft het
       * hele vlak niet doorzichtig voor te worden. */
      className="transition-colors duration-200"
      onClick={onFocus}
    >
      <div className={`flex items-center gap-2 ${compact ? 'px-3 pt-3 pb-1' : 'px-5 pt-5 pb-2'}`}>
        <ProviderLogo id={provider.id} />
        <div className="min-w-0">
          <h3 className="text-surface-title font-semibold text-axe-text-primary truncate">{provider.name}</h3>
          <p className="text-axe-meta text-axe-text-muted mt-0.5 leading-snug line-clamp-2">{provider.tagline}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={compact ? 'px-3 pb-3' : 'px-4 pb-4'}>
        {/* Mat zwart, geen gekleurde gloed.
         *
         * Dit was bg-black/40 met een 20px gloed in de kleur van de provider.
         * Doorschijnend zwart op de plaat wordt vaal, en drie kaarten met elk
         * een eigen gekleurde rand maken van de startpagina een lappendeken.
         * De kleur van een provider hoort in zijn ICOON en zijn knoppen te
         * zitten -- daar zegt hij iets -- niet in de omranding van elk vlak. */}
        <div className="rounded-card border border-axe-line overflow-hidden" style={{ background: 'var(--surface-bg)' }}>
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
            /* Een regel erbij: de kaarten mochten iets hoger, alleen
               verticaal. Via rows en niet via een vaste hoogte, zodat de
               tekst nog steeds bepaalt hoe groot het veld is. */
            rows={compact ? 3 : 4}
            disabled={isLoading}
            className="w-full px-3 pt-2.5 pb-1.5 bg-transparent text-surface-body text-axe-text-primary placeholder:text-axe-text-muted outline-none resize-none"
          />

          <div className="flex items-center justify-between px-2.5 pb-2.5 gap-1.5">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {provider.modes?.map((mode) => {
                const Icon = mode.icon ? MODE_ICONS[mode.icon] : undefined;
                const selected = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveMode(mode.id); }}
                    /* Geen blok in de kleur van de provider, alleen de LETTERS.
                       Een gevulde pil met een gekleurde rand is een knop uit
                       een andere app; hier zegt de kleur alleen "dit staat
                       aan". Zelfde regel als in de rest van de plaat: kleur
                       leeft in de tekst, niet in een vlak. */
                    className="axe-chip !text-[10px] !py-1 !px-2 !bg-transparent !border-transparent"
                    aria-pressed={selected}
                    style={selected ? { color: provider.accent } : undefined}
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
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 shrink-0"
              style={{ backgroundColor: provider.accent }}
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 text-white" />
              )}
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
