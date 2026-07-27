/**
 * browserAgentLoop.ts
 * ------------------------------------------------------------------
 * Drives a real Playwright browser session (backend/axe_api/browser_agent.py)
 * from a natural-language instruction: the model proposes ONE action per
 * turn (navigate/click/type/read/done), the action is executed for real
 * against a headless Chromium, and the real resulting page state is fed
 * back for the next turn — same shape as localCodeAgent's runAgentLoop,
 * applied to browser actions instead of file patches.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import {
  browserAgentNavigate, browserAgentClick, browserAgentType, browserAgentRead,
} from '@/infrastructure/gateways/axeCoreApiService';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'read' | 'done';
  url?: string;
  selector?: string;
  text?: string;
  submit?: boolean;
}

export interface BrowserAgentTurn {
  reasoning: string;
  message: string;
  action: BrowserAction;
  result?: { url: string; title: string; text?: string; error?: string };
  iteration: number;
}

const SYSTEM_PROMPT = `Je bestuurt een echte webbrowser via acties op een pagina. Antwoord ALTIJD met strict JSON, niets anders:
{"reasoning": "korte redenering", "message": "wat je net deed/gaat doen, voor de gebruiker", "action": {"type": "navigate"|"click"|"type"|"read"|"done", "url"?: "...", "selector"?: "CSS selector", "text"?: "...", "submit"?: true|false}}
Regels:
- Eén actie per beurt.
- Gebruik "read" om de huidige pagina-tekst te zien voordat je iets aanklikt of intypt.
- "selector" is een geldige CSS-selector (bijv. "#zoekveld", "button[type=submit]", ".btn-primary").
- Gebruik "done" zodra de taak klaar is of onmogelijk blijkt — leg dat uit in "message".
- Verzin nooit dat iets gelukt is — na elke actie krijg je de echte resulterende pagina terug, baseer je volgende zet daarop.`;

function parseAction(raw: string): { reasoning: string; message: string; action: BrowserAction } {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned) as { reasoning?: string; message?: string; action?: BrowserAction };
  if (!parsed.action?.type) throw new Error('No action.type in model response');
  return { reasoning: parsed.reasoning ?? '', message: parsed.message ?? '', action: parsed.action };
}

export async function runBrowserAgentLoop(
  instruction: string,
  sessionId: string,
  slots: KeySlot[],
  opts: { maxIterations?: number; onTurn?: (turn: BrowserAgentTurn) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const maxIterations = opts.maxIterations ?? 6;
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: instruction },
  ];

  for (let i = 0; i < maxIterations; i++) {
    if (opts.signal?.aborted) return;
    const messages = [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...history];

    let raw = '';
    let lastErr = '';
    for (const slot of slots) {
      try {
        raw = await callProvider(slot, messages);
        if (raw?.trim()) break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (!raw?.trim()) {
      opts.onTurn?.({ reasoning: '', message: `Kon geen antwoord krijgen van het model${lastErr ? `: ${lastErr}` : ''}.`, action: { type: 'done' }, iteration: i });
      return;
    }

    let turn: { reasoning: string; message: string; action: BrowserAction };
    try {
      turn = parseAction(raw);
    } catch {
      opts.onTurn?.({ reasoning: '', message: raw.slice(0, 400), action: { type: 'done' }, iteration: i });
      return;
    }

    history.push({ role: 'assistant', content: raw });

    if (turn.action.type === 'done') {
      opts.onTurn?.({ ...turn, iteration: i });
      return;
    }

    let result: BrowserAgentTurn['result'];
    try {
      if (turn.action.type === 'navigate' && turn.action.url) {
        result = await browserAgentNavigate(sessionId, turn.action.url);
      } else if (turn.action.type === 'click' && turn.action.selector) {
        result = await browserAgentClick(sessionId, turn.action.selector);
      } else if (turn.action.type === 'type' && turn.action.selector) {
        result = await browserAgentType(sessionId, turn.action.selector, turn.action.text ?? '', turn.action.submit ?? false);
      } else if (turn.action.type === 'read') {
        result = await browserAgentRead(sessionId);
      } else {
        result = { url: '', title: '', error: 'Onvolledige actie (ontbrekende url of selector).' };
      }
    } catch (e) {
      result = { url: '', title: '', error: e instanceof Error ? e.message : String(e) };
    }

    opts.onTurn?.({ ...turn, result, iteration: i });

    const readText = result && 'text' in result ? (result as { text?: string }).text : undefined;
    history.push({
      role: 'user',
      content: result?.error
        ? `Actie mislukt: ${result.error}`
        : `Resultaat: url=${result?.url}, title=${result?.title}${readText ? `\ntekst: ${readText.slice(0, 2000)}` : ''}`,
    });
  }

  opts.onTurn?.({ reasoning: '', message: 'Maximum aantal stappen bereikt.', action: { type: 'done' }, iteration: maxIterations });
}
