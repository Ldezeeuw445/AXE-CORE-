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
            AXE requests tools through the API instead of writing markers in
            text that get regexed out afterwards. Several tools per turn,
            validated arguments, and a failed tool comes back as a failure
            instead of an empty result.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Works with Anthropic, OpenAI, Gemini, Groq and OpenRouter. Ollama and
            the VPS agents fall back to the marker route. Approvals stay the
            same: the same card, the same risk levels.
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
