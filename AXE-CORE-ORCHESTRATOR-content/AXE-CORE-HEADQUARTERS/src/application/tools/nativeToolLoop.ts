/**
 * The agent loop, on native tool calling.
 *
 * Runs beside resolveModelToolCalls() in voiceStore rather than replacing it,
 * so the marker route stays intact and the two can be compared on the same
 * question. Which one runs is a switch in Settings.
 *
 * ## What is different from the marker loop
 *
 * ONE TOOL PER ROUND becomes all of them. The marker loop breaks after the
 * first regex match, so "check git status and read the progress note" is two
 * round trips minimum, and the model learns it only ever gets one. Native
 * calls arrive as a list and run together.
 *
 * RESULTS GO BACK AS RESULTS. The marker loop appends the output to a user
 * message reading "now give your full answer based on this information", which
 * asks the model to rewrite its whole reply from prose. Native results attach
 * to the call that asked for them, so the model continues rather than restarts.
 *
 * FAILURES ARE VISIBLE TO THE MODEL. The marker loop breaks the round on a
 * tool error unless the tool defines onError. Here a failure comes back as
 * that call's result, which is what lets the model say "that failed" instead
 * of quietly answering as though it had worked.
 *
 * ## What is deliberately the same
 *
 * Approvals, risk gates and event recording are untouched. They are reached
 * through the same TOOL_RUNTIMES executors and the same requestApproval
 * callback. A tool being callable has never been the same as a tool being
 * allowed, and that does not change here.
 */
import { TOOL_RUNTIMES } from '@/application/tools/toolRegistry';
import { toolDefs } from '@/domain/tools/toolSchemas';
import type { ApprovalKind } from '@/domain/tools/toolCatalog';
import type { KeySlot } from '@/domain/providers';
import {
  callProviderWithTools,
  type ToolMessage,
  type ToolCall,
} from '@/infrastructure/gateways/llmToolGateway';

export interface NativeLoopDeps {
  requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean>;
  /** Same shape voiceStore already records. Optional so this stays testable. */
  record?: (e: {
    kind: 'tool_call' | 'error';
    summary: string;
    details: Record<string, unknown>;
  }) => void;
}

export interface NativeLoopResult {
  text: string;
  /** Tool ids that actually executed. The only trustworthy evidence of work. */
  ranTools: string[];
  rounds: number;
}

/**
 * Structured input -> the string the existing executors expect.
 *
 * The executors were written against regex captures: some take a bare value
 * (`[SEARCH: "bitcoin"]` -> "bitcoin"), some take JSON (`[MAC: {...}]`). Rather
 * than rewrite twenty-four of them, the shape is reconstructed here.
 *
 * Single-argument tools get the bare value, which is what their parser wants.
 * Everything else gets JSON, which is what the JSON-shaped ones already parse.
 */
function toRawArg(name: string, input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 1) {
    const v = input[keys[0]];
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  return JSON.stringify(input);
}

/** Human-readable line for the approval card and the event log. */
function summarise(call: ToolCall): string {
  const parts = Object.entries(call.input)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
  return parts.slice(0, 600);
}

async function runOne(
  call: ToolCall,
  deps: NativeLoopDeps,
): Promise<{ id: string; name: string; output: string; ok: boolean }> {
  const runtime = TOOL_RUNTIMES.find(t => t.id === call.name);

  if (!runtime) {
    // A name that is not in the registry. Said plainly rather than silently
    // dropped, so the model can correct itself instead of assuming it worked.
    return { id: call.id, name: call.name, ok: false,
      output: `No such tool: ${call.name}. It is not available in this build.` };
  }
  if (!runtime.available()) {
    return { id: call.id, name: call.name, ok: false,
      output: `${call.name} is not available right now (not configured, or its backend is down).` };
  }

  const started = Date.now();
  const raw = toRawArg(call.name, call.input);
  try {
    // The executor owns the approval gate — same call, same card, same tiers.
    const output = await runtime.run(raw, { requestApproval: deps.requestApproval });
    deps.record?.({
      kind: 'tool_call',
      summary: `${call.name} ok`,
      details: { tool: call.name, args: raw.slice(0, 500), ms: Date.now() - started,
                 ok: true, result: output.slice(0, 800), native: true },
    });
    return { id: call.id, name: call.name, output, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.record?.({
      kind: 'error',
      summary: `${call.name} failed: ${msg.slice(0, 120)}`,
      details: { tool: call.name, args: raw.slice(0, 500), ms: Date.now() - started,
                 ok: false, error: msg, native: true },
    });
    // Returned, not thrown. A failed tool is information the model needs, and
    // aborting the round is how you get an answer that ignores the failure.
    return { id: call.id, name: call.name, ok: false, output: `Tool failed: ${msg}` };
  }
}

/**
 * Drive the conversation until the model stops asking for tools.
 *
 * `maxRounds` is a ceiling, not a target: most turns use nought or one. Four
 * is enough for read -> decide -> act -> confirm, and low enough that a model
 * stuck in a loop costs seconds rather than a rate limit.
 */
export async function runNativeToolLoop(
  slot: KeySlot,
  messages: ToolMessage[],
  deps: NativeLoopDeps,
  maxRounds = 4,
): Promise<NativeLoopResult> {
  const convo: ToolMessage[] = [...messages];
  const defs = toolDefs().filter(d => TOOL_RUNTIMES.some(t => t.id === d.name));
  const ranTools: string[] = [];
  let text = '';
  let round = 0;

  for (; round < maxRounds; round++) {
    const turn = await callProviderWithTools(slot, convo, defs);
    text = turn.text || text;

    if (!turn.toolCalls.length) break;

    convo.push({ role: 'assistant', content: turn.text, toolCalls: turn.toolCalls });

    // All of them, together. Approvals still serialise where a card appears,
    // but two read-only calls have no reason to wait for each other.
    const results = await Promise.all(turn.toolCalls.map(c => runOne(c, deps)));

    for (const r of results) {
      if (r.ok) ranTools.push(r.name);
      convo.push({ role: 'tool', toolCallId: r.id, name: r.name, content: r.output });
    }
  }

  return { text, ranTools, rounds: round };
}
