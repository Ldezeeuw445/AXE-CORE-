/**
 * localCodeAgent.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Agentic code editor that operates on the real workspace files (via the
 * VPS file API) instead of GitHub.
 *
 * Two modes, both real, no mock in either:
 *  - runLocalAgent(): single round — read context, propose patches, return.
 *    This is the original, unchanged behavior (Agent Mode OFF): the user
 *    reviews and accepts/rejects every patch by hand, nothing is applied
 *    automatically, nothing runs.
 *  - runAgentLoop(): the "Agent Mode ON" path — the same per-turn reasoning,
 *    but iterated: the model can also request a real shell command (run in
 *    the actual workspace repo via the existing /internal/exec endpoint),
 *    see its real stdout/stderr/exit code on the next turn, and keep fixing
 *    until it reports done or an iteration cap is hit. Patches are applied
 *    for real to disk as they're produced (the user opted into that by
 *    turning Agent Mode on), but every turn — every patch, every command,
 *    every output — is returned so the UI can show a full, honest
 *    transcript. Nothing here fabricates a result: a command's output is
 *    always the real output of execCommand(), never invented.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { searchWorkspace, readWorkspaceFile, writeWorkspaceFile } from '@/infrastructure/persistence/workspaceFilesService';
import { execCommand } from '@/infrastructure/gateways/axeCoreApiService';

/* ─── Public types ──────────────────────────────────────────────────────── */
export interface FilePatch {
  /** Workspace-relative file path, e.g. "my-repo/src/App.tsx" */
  file: string;
  /** Exact substring to find in the file (must exist verbatim). */
  search: string;
  /** Replacement string. */
  replace: string;
  /** One-sentence description of what this patch does. */
  description: string;
}

export interface AgentResponse {
  /** Human-readable summary of the plan. */
  message: string;
  /** Ordered list of file patches to apply. */
  patches: FilePatch[];
  /** Files the agent read for context. */
  filesRead: string[];
  /** A shell command the agent wants to run to verify/iterate, or null. */
  run: string | null;
  /** True when the agent considers the task complete (no more steps needed). */
  done: boolean;
}

/** One iteration of the agent loop, as actually executed — for the UI's
 *  transcript. `appliedPatches` is the subset of `patches` actually written
 *  to disk (only non-empty in autoApply/Agent-Mode-on runs). */
export interface AgentTurn {
  message: string;
  patches: FilePatch[];
  appliedPatches: FilePatch[];
  filesRead: string[];
  ranCommand: { command: string; output: string; exitCode: number | null; timedOut: boolean } | null;
  done: boolean;
  iteration: number;
}

/* ─── System prompt ─────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are AXE Code Agent — a surgical, iterative code editor for a real project workspace.

You receive a task description plus file context (and, on later turns, the
REAL output of any command you asked to run). Respond with ONLY a JSON object:
{
  "message": "Brief natural-language explanation of what you are doing this turn",
  "patches": [
    {
      "file": "workspace-relative/path/to/file.ts",
      "search": "exact multiline string to find (must exist verbatim in file)",
      "replace": "replacement string",
      "description": "one-sentence description"
    }
  ],
  "run": "shell command to run next (e.g. to build/test/typecheck), or null",
  "done": false
}

STRICT RULES:
1. The "search" field MUST be copied verbatim from the file content shown — including whitespace and indentation.
2. Make the SMALLEST change that fulfils the task.
3. Never produce broken or incomplete code.
4. Preserve existing style (quotes, indentation, naming).
5. You may produce patches for multiple files in one turn.
6. If the task is ambiguous or cannot be done safely, set "patches": [], explain in "message", and set "done": true.
7. Use "run" to verify your own work (typecheck, build, run tests) — you will
   see the REAL stdout/stderr/exit code on the next turn and can fix real
   errors. Don't guess whether something works; run it and look.
8. Set "done": true only when the task is actually finished (a requested
   command succeeded, or no verification is needed). There is a hard cap on
   how many turns you get — if you're not done by then you'll be stopped, so
   don't pad turns.
9. Respond ONLY with the JSON — no markdown fences, no text before or after.`;

/* ─── Context gathering (shared by both modes) ──────────────────────────── */
async function gatherContext(
  instruction: string,
  activeFile: { path: string; content: string } | null,
): Promise<{ contextParts: string[]; filesRead: string[] }> {
  const contextParts: string[] = [];
  const filesRead: string[] = [];

  if (activeFile) {
    contextParts.push(`ACTIVE FILE: ${activeFile.path}\n\`\`\`\n${activeFile.content.slice(0, 10_000)}\n\`\`\``);
    filesRead.push(activeFile.path);
  }

  try {
    const componentNames =
      instruction.match(/\b[A-Z][a-zA-Z]{2,}(?:Page|Component|Hook|Service|Store|Panel|Modal|Card|Button|Form|Table|List|Header|Footer|Nav|Menu|Dialog|Drawer|Tab|Section|Layout|View|Sidebar|Bar|Toolbar)\b/g) || [];
    const keywords = [...new Set(componentNames)].slice(0, 2);
    const searchQuery = keywords.length > 0 ? keywords[0] : instruction.trim().split(/\s+/).slice(0, 4).join(' ');

    const results = await searchWorkspace(searchQuery, { maxResults: 10, glob: '*.{ts,tsx,js,jsx}' });
    const relatedPaths = [...new Set(results.map(r => r.file))]
      .filter(f => f !== activeFile?.path)
      .filter(f => !f.includes('node_modules') && !f.includes('.git'))
      .slice(0, 3);

    for (const filePath of relatedPaths) {
      try {
        const content = await readWorkspaceFile(filePath);
        contextParts.push(`RELATED FILE: ${filePath}\n\`\`\`\n${content.slice(0, 3_000)}\n\`\`\``);
        filesRead.push(filePath);
      } catch { /* skip unreadable */ }
    }
  } catch { /* search failure is non-fatal */ }

  return { contextParts, filesRead };
}

function parseAgentJson(raw: string): Partial<AgentResponse> | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<AgentResponse>;
    if (typeof parsed.message === 'string' && Array.isArray(parsed.patches)) return parsed;
  } catch { /* fall through */ }
  return null;
}

async function callAgent(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  slots: KeySlot[],
): Promise<AgentResponse | null> {
  for (const slot of slots) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callProvider(slot, messages);
        const parsed = parseAgentJson(raw);
        if (parsed) {
          return {
            message: parsed.message!,
            patches: parsed.patches as FilePatch[],
            filesRead: [],
            run: typeof parsed.run === 'string' && parsed.run.trim() ? parsed.run.trim() : null,
            done: parsed.done !== false,
          };
        }
        messages.push({ role: 'assistant', content: raw });
        messages.push({ role: 'user', content: 'Your response was not valid JSON with "message" and "patches" fields. Reply with ONLY the JSON object.' });
      } catch { /* try next attempt / slot */ }
    }
  }
  return null;
}

/* ─── Mode 1: single round, manual review (original, unchanged) ────────── */
export async function runLocalAgent(
  instruction: string,
  activeFile: { path: string; content: string } | null,
  slots: KeySlot[],
  onStatus?: (msg: string) => void,
): Promise<AgentResponse> {
  if (slots.length === 0) {
    return { message: 'No AI provider is configured. Please set up a provider in Settings first.', patches: [], filesRead: [], run: null, done: true };
  }
  onStatus?.('🔍 Gathering context…');
  const { contextParts, filesRead } = await gatherContext(instruction, activeFile);

  onStatus?.('🤖 Generating patches…');
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `TASK: ${instruction}\n\n${contextParts.join('\n\n---\n\n')}\n\nRespond with ONLY the JSON object.` },
  ];

  const result = await callAgent(messages, slots);
  if (!result) {
    return { message: 'The AI could not generate a valid patch response. Please try rephrasing your request.', patches: [], filesRead, run: null, done: true };
  }
  return { ...result, filesRead };
}

/* ─── Apply a single patch to file content ──────────────────────────────── */
export function applyPatch(content: string, patch: Pick<FilePatch, 'search' | 'replace'>): string | null {
  if (!content.includes(patch.search)) return null;
  return content.replace(patch.search, patch.replace);
}

/* ─── Plan — a short upfront outline before any turn executes, so the user
 *  can redirect before AXE touches a single file, not just react after. ── */
async function planTask(
  instruction: string,
  activeFile: { path: string; content: string } | null,
  slots: KeySlot[],
): Promise<string[] | null> {
  const { contextParts } = await gatherContext(instruction, activeFile);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: 'You are AXE Code Agent. Before making any change, state your plan as JSON: {"steps": ["short step 1", "short step 2", ...]}. 2-5 steps, each one short sentence, describing what you intend to do — not the final code. Respond ONLY with the JSON object, no markdown fences, no other text.' },
    { role: 'user', content: `TASK: ${instruction}\n\n${contextParts.join('\n\n---\n\n')}\n\nRespond with ONLY the JSON plan.` },
  ];
  for (const slot of slots) {
    try {
      const raw = await callProvider(slot, messages);
      const cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
      const parsed = JSON.parse(cleaned) as { steps?: unknown };
      if (Array.isArray(parsed.steps) && parsed.steps.length > 0 && parsed.steps.every(s => typeof s === 'string')) {
        return parsed.steps as string[];
      }
    } catch { /* try next slot */ }
  }
  return null;
}

/* ─── Mode 2: iterative agent loop (Agent Mode ON) ──────────────────────── */
export interface AgentLoopOptions {
  /** Workspace-relative folder to run commands in, e.g. "my-repo". Empty
   *  string runs at the workspace root. */
  workspaceRoot: string;
  /** Max round-trips before the loop force-stops (safety net against a
   *  model that never says done). */
  maxIterations?: number;
  /** Called after each turn completes, so the UI can render a live
   *  transcript instead of waiting for the whole loop to finish. */
  onTurn?: (turn: AgentTurn) => void;
  /** Called ONCE, before the first turn executes, with a short plan the
   *  model states up front — real (a real model call, not scripted), best
   *  effort (a plan that fails to parse just means turns start immediately,
   *  same as before this existed). */
  onPlan?: (steps: string[]) => void;
  /** Abort the loop early (e.g. a user-pressed Stop button). */
  signal?: AbortSignal;
}

export async function runAgentLoop(
  instruction: string,
  activeFile: { path: string; content: string } | null,
  slots: KeySlot[],
  opts: AgentLoopOptions,
): Promise<AgentTurn[]> {
  const maxIterations = opts.maxIterations ?? 5;
  const turns: AgentTurn[] = [];

  if (slots.length === 0) {
    const turn: AgentTurn = { message: 'No AI provider is configured. Please set up a provider in Settings first.', patches: [], appliedPatches: [], filesRead: [], ranCommand: null, done: true, iteration: 1 };
    opts.onTurn?.(turn);
    return [turn];
  }

  if (opts.onPlan && !opts.signal?.aborted) {
    const steps = await planTask(instruction, activeFile, slots);
    if (steps) opts.onPlan(steps);
  }

  const { contextParts, filesRead } = await gatherContext(instruction, activeFile);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `TASK: ${instruction}\n\n${contextParts.join('\n\n---\n\n')}\n\nRespond with ONLY the JSON object.` },
  ];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (opts.signal?.aborted) break;

    const result = await callAgent(messages, slots);
    if (!result) {
      const turn: AgentTurn = { message: 'The AI could not generate a valid response. Stopping.', patches: [], appliedPatches: [], filesRead: iteration === 1 ? filesRead : [], ranCommand: null, done: true, iteration };
      turns.push(turn); opts.onTurn?.(turn);
      break;
    }
    messages.push({ role: 'assistant', content: JSON.stringify(result) });

    // Apply patches for real — the user already opted into this by turning
    // Agent Mode on. Every attempt (success or failure) is recorded so the
    // transcript never silently drops a change.
    const appliedPatches: FilePatch[] = [];
    for (const patch of result.patches) {
      try {
        const current = await readWorkspaceFile(patch.file);
        const next = applyPatch(current, patch);
        if (next === null) continue; // search string not found — skip, don't fabricate success
        await writeWorkspaceFile(patch.file, next);
        appliedPatches.push(patch);
      } catch { /* unreadable/unwritable file — skip, reflected by omission from appliedPatches */ }
    }

    let ranCommand: AgentTurn['ranCommand'] = null;
    if (result.run && !opts.signal?.aborted) {
      const cwd = opts.workspaceRoot ? `cd ${JSON.stringify(opts.workspaceRoot)} && ` : '';
      try {
        const execResult = await execCommand(`${cwd}${result.run}`, 60);
        ranCommand = {
          command: result.run,
          output: `${execResult.stdout}${execResult.stderr}`.trim().slice(0, 4000),
          exitCode: execResult.exit_code,
          timedOut: execResult.timed_out,
        };
      } catch (e) {
        ranCommand = { command: result.run, output: e instanceof Error ? e.message : String(e), exitCode: null, timedOut: false };
      }
    }

    const turn: AgentTurn = {
      message: result.message,
      patches: result.patches,
      appliedPatches,
      filesRead: iteration === 1 ? filesRead : [],
      ranCommand,
      done: result.done && !result.run,
      iteration,
    };
    turns.push(turn);
    opts.onTurn?.(turn);

    if (turn.done) break;
    if (!ranCommand) break; // nothing more to react to and not done — stop rather than loop blindly

    messages.push({
      role: 'user',
      content: `Command result for \`${ranCommand.command}\` (exit code ${ranCommand.exitCode ?? 'null'}${ranCommand.timedOut ? ', TIMED OUT' : ''}):\n\`\`\`\n${ranCommand.output || '(no output)'}\n\`\`\`\nRespond with ONLY the next JSON object — fix any real error shown above, or set "done": true if this confirms the task is complete.`,
    });
  }

  return turns;
}
