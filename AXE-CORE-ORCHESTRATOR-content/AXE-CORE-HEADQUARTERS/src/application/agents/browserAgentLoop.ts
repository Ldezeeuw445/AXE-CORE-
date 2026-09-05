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
import { latestOpenTurnId, noteTurnOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { callProvider, callWithFallback } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { cascadeAround } from '@/domain/providers';
import {
  browserAgentNavigate, browserAgentClick, browserAgentType, browserAgentRead,
  browserAgentElements, browserAgentPress, browserAgentScroll,
} from '@/infrastructure/gateways/axeCoreApiService';
import { buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { ECOSYSTEM_CONTEXT } from '@/domain/prompts';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'read' | 'elements' | 'press' | 'scroll' | 'done';
  url?: string;
  selector?: string;
  /** Click a point instead of a selector — what a person actually does. */
  x?: number;
  y?: number;
  text?: string;
  submit?: boolean;
  key?: string;
  dy?: number;
}

export interface BrowserAgentTurn {
  reasoning: string;
  message: string;
  action: BrowserAction;
  result?: { url: string; title: string; text?: string; error?: string };
  iteration: number;
}

const SYSTEM_PROMPT = `Je bestuurt een echte webbrowser, zoals een mens dat doet. Antwoord ALTIJD met strict JSON, niets anders:
{"reasoning": "korte redenering", "message": "wat je net deed/gaat doen, voor de gebruiker", "action": {"type": "navigate"|"elements"|"click"|"type"|"press"|"scroll"|"read"|"done", "url"?: "...", "selector"?: "CSS", "x"?: 123, "y"?: 456, "text"?: "...", "submit"?: true, "key"?: "Enter", "dy"?: 600}}

Acties:
- navigate  — ga naar een URL.
- elements  — vraag op wat er NU klikbaar is: elk element met label en x/y. Doe dit VOORDAT je klikt.
- click     — klik op {"x":..,"y":..} uit die lijst, of op een selector als je er zeker van bent.
- type      — tekst intypen. Zonder selector gaat het naar waar de focus staat, precies zoals na een klik. Zet "submit": true om af te sluiten met Enter.
- press     — losse toets: Enter, Escape, Tab, ArrowDown, PageDown.
- scroll    — "dy" pixels naar beneden (negatief = omhoog).
- read      — de tekst van de pagina.
- done      — klaar of onmogelijk; leg uit waarom in "message".

Regels:
- Eén actie per beurt.
- KLIK NOOIT OP EEN GOKTE SELECTOR. Vraag eerst "elements" op en klik op de coördinaten die je daar ziet. Een verzonnen selector klikt met volle overtuiging op het verkeerde ding.
- Verzin nooit dat iets gelukt is — na elke actie krijg je de echte pagina terug. Baseer je volgende zet daarop.
- Zie je een cookiemelding of inlogmuur, meld dat in "message" en ga niet inloggen.`;

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

  // Same memory + ecosystem context the main chat gets — without this, the
  // browser agent ran with zero knowledge of anything AXE has ever done or
  // controls, every single time.
  const memoryContext = await buildGlobalMemoryContext(AXE_USER_ID, instruction, 800).catch(() => '');

  // Het ophalen hierboven loopt via de duurzame brain, en die noteert AL welke
  // herinneringen eruit kwamen (globalBrainService -> noteRetrieval). Wat
  // ontbrak was de andere helft: niemand vertelde ooit of het goed ging.
  //
  // Daardoor zat deze agent stilletjes half in de lus -- elke taak legde vast
  // wat er was opgehaald, en geen enkele beurt kreeg ooit een oordeel, dus er
  // werd nooit iets versterkt. Precies het patroon waar deze codebase vol mee
  // zit: iets lijkt te werken omdat er data ontstaat.
  const memoryTurnId = latestOpenTurnId();
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${ECOSYSTEM_CONTEXT}${memoryContext ? `\n\n${memoryContext}` : ''}`;

  const finish = (outcome: 'completed' | 'failed', message: string) => {
    // De beurt sluiten met wat er echt gebeurde. Een afgeronde taak is zwak
    // bewijs dat een bepaalde herinnering hielp -- er gingen er meerdere in --
    // dus dit tilt het gewicht een beetje op in plaats van het te zetten.
    noteTurnOutcome(memoryTurnId, outcome === 'completed' ? 'good' : 'poor');

    void writeReflection({
      title: `Browser agent: ${instruction.slice(0, 60)}`,
      whatHappened: message || instruction,
      outcome,
      category: 'browser_agent',
    });
  };

  for (let i = 0; i < maxIterations; i++) {
    if (opts.signal?.aborted) return;
    const messages = [{ role: 'system' as const, content: fullSystemPrompt }, ...history];

    let raw = '';
    let lastErr = '';
    for (const slot of slots) {
      try {
        raw = await callWithFallback(cascadeAround(slot), messages);
        if (raw?.trim()) break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (!raw?.trim()) {
      const msg = `Could not get an answer from the model${lastErr ? `: ${lastErr}` : ''}.`;
      opts.onTurn?.({ reasoning: '', message: msg, action: { type: 'done' }, iteration: i });
      finish('failed', msg);
      return;
    }

    let turn: { reasoning: string; message: string; action: BrowserAction };
    try {
      turn = parseAction(raw);
    } catch {
      opts.onTurn?.({ reasoning: '', message: raw.slice(0, 400), action: { type: 'done' }, iteration: i });
      finish('failed', `Could not parse model response: ${raw.slice(0, 300)}`);
      return;
    }

    history.push({ role: 'assistant', content: raw });

    if (turn.action.type === 'done') {
      opts.onTurn?.({ ...turn, iteration: i });
      finish('completed', turn.message || instruction);
      return;
    }

    let result: BrowserAgentTurn['result'];
    try {
      if (turn.action.type === 'navigate' && turn.action.url) {
        result = await browserAgentNavigate(sessionId, turn.action.url);
      } else if (turn.action.type === 'click' && turn.action.x != null && turn.action.y != null) {
        result = await browserAgentClick(sessionId, { x: turn.action.x, y: turn.action.y });
      } else if (turn.action.type === 'click' && turn.action.selector) {
        result = await browserAgentClick(sessionId, turn.action.selector);
      } else if (turn.action.type === 'type') {
        result = await browserAgentType(sessionId, turn.action.text ?? '', {
          selector: turn.action.selector, submit: turn.action.submit ?? false,
        });
      } else if (turn.action.type === 'press' && turn.action.key) {
        result = await browserAgentPress(sessionId, turn.action.key);
      } else if (turn.action.type === 'scroll') {
        result = await browserAgentScroll(sessionId, turn.action.dy ?? 600);
      } else if (turn.action.type === 'elements') {
        // Handed back as text so the model reads it the same way it reads a
        // page — coordinates included, so the next turn can click what it saw
        // rather than guess a selector.
        const el = await browserAgentElements(sessionId);
        const lines = el.elements
          .map(e => `(${e.x},${e.y}) ${e.tag}${e.type ? `[${e.type}]` : ''} ${e.label || e.name || e.href || ''}`.trim())
          .slice(0, 60);
        result = { url: el.url, title: `${el.count} klikbare elementen`, text: lines.join('\n') };
      } else if (turn.action.type === 'read') {
        result = await browserAgentRead(sessionId);
      } else {
        result = { url: '', title: '', error: 'Incomplete action — give a url, coordinates or a selector.' };
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
  finish('failed', `Maximum aantal stappen bereikt zonder "done" voor: ${instruction}`);
}
