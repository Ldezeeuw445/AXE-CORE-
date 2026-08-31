/**
 * Native tool calling — the switch, and an honest description of the trade.
 *
 * This was behind a localStorage key you had to set from the console, which is
 * fine for testing a thing and wrong for a thing you are supposed to choose.
 * Both routes still exist; this decides which one runs.
 */
import { useEffect, useState } from 'react';
import { Switch } from '@/presentation/components/ui/switch';
import { toolDefs } from '@/domain/tools/toolSchemas';
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';

const KEY = 'axe_native_tools';

export function ToolCallingSection() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try { setOn(localStorage.getItem(KEY) === '1'); } catch { /* private mode */ }
  }, []);

  const toggle = (next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch { /* private mode */ }
  };

  // Measured, not claimed: the marker protocol's cost is the whole argument
  // for replacing it, and an argument you cannot check is just a story.
  const markerChars = TOOL_CATALOG.reduce((n, t) => n + t.promptDoc.length, 0);
  const schemaChars = JSON.stringify(toolDefs()).length;
  const saved = Math.max(0, Math.round((1 - schemaChars / markerChars) * 100));

  return (
    <div className="widget-card" style={{ borderRadius: 'var(--radius)', padding: 16 }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            className="text-[11px] font-semibold uppercase tracking-[.1em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Tool calling
          </h3>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
            Native tool calling
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            AXE vraagt tools op via de API in plaats van markers in tekst te
            schrijven die er daarna uitgeregexed worden. Meerdere tools per
            beurt, gevalideerde argumenten, en een mislukte tool komt terug als
            mislukking in plaats van als leeg resultaat.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Werkt met Anthropic, OpenAI, Gemini, Groq en OpenRouter. Ollama en de
            VPS-agents vallen terug op de marker-route. Goedkeuringen blijven
            hetzelfde: dezelfde kaart, dezelfde risico-niveaus.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={toggle} aria-label="Native tool calling" />
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 font-mono text-[11px]"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <span>{toolDefs().length} tools</span>
        <span>~{saved}% minder prompt per beurt</span>
        <span style={{ color: on ? 'var(--success)' : 'var(--text-muted)' }}>
          {on ? 'actief' : 'marker-route'}
        </span>
      </div>
    </div>
  );
}
