/**
 * localCodeAgent.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Agentic code editor that operates on the real workspace files (via the
 * api-server file API) instead of GitHub.
 *
 * The agent receives an instruction + the active file context, optionally
 * searches for related files, then asks the LLM to produce a set of
 * precise search-and-replace patches (no full-file rewrites).
 */
import { callProvider, type KeySlot } from '@/store/voiceStore';
import { searchWorkspace, readWorkspaceFile } from '@/infrastructure/gateways/workspaceFilesService';

/* ─── Public types ──────────────────────────────────────────────────────── */
export interface FilePatch {
  /** Workspace-relative file path, e.g. "artifacts/axe-core-hq/src/App.tsx" */
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
}

/* ─── System prompt ─────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are AXE Code Agent — a surgical code editor for a real project workspace.

You receive a task description plus file context. You respond with ONLY a JSON object:
{
  "message": "Brief natural-language explanation of what you are doing",
  "patches": [
    {
      "file": "workspace-relative/path/to/file.ts",
      "search": "exact multiline string to find (must exist verbatim in file)",
      "replace": "replacement string",
      "description": "one-sentence description"
    }
  ]
}

STRICT RULES:
1. The "search" field MUST be copied verbatim from the file content shown — including whitespace and indentation
2. Make the SMALLEST change that fulfils the task
3. Never produce broken or incomplete code
4. Preserve existing style (quotes, indentation, naming)
5. You may produce patches for multiple files
6. If the task is ambiguous or cannot be done safely, set "patches": [] and explain in "message"
7. Respond ONLY with the JSON — no markdown fences, no text before or after`;

/* ─── Main agent function ───────────────────────────────────────────────── */
export async function runLocalAgent(
  instruction: string,
  activeFile: { path: string; content: string } | null,
  slots: KeySlot[],
  onStatus?: (msg: string) => void,
): Promise<AgentResponse> {
  if (slots.length === 0) {
    return {
      message: 'No AI provider is configured. Please set up a provider in Settings first.',
      patches: [],
      filesRead: [],
    };
  }

  onStatus?.('🔍 Gathering context…');
  const contextParts: string[] = [];
  const filesRead: string[] = [];

  /* ── Active file ─────────────────────────────────────────────────────── */
  if (activeFile) {
    contextParts.push(
      `ACTIVE FILE: ${activeFile.path}\n\`\`\`\n${activeFile.content.slice(0, 10_000)}\n\`\`\``,
    );
    filesRead.push(activeFile.path);
  }

  /* ── Search for related files ────────────────────────────────────────── */
  try {
    // Extract component / hook names from instruction (UpperCamelCase words)
    const componentNames =
      instruction.match(/\b[A-Z][a-zA-Z]{2,}(?:Page|Component|Hook|Service|Store|Panel|Modal|Card|Button|Form|Table|List|Header|Footer|Nav|Menu|Dialog|Drawer|Tab|Section|Layout|View|Sidebar|Bar|Toolbar)\b/g) || [];

    const keywords = [...new Set(componentNames)].slice(0, 2);
    const searchQuery =
      keywords.length > 0
        ? keywords[0]
        : instruction.trim().split(/\s+/).slice(0, 4).join(' ');

    const results = await searchWorkspace(searchQuery, {
      maxResults: 10,
      glob: '*.{ts,tsx,js,jsx}',
    });

    const relatedPaths = [
      ...new Set(results.map((r) => r.file)),
    ]
      .filter((f) => f !== activeFile?.path)
      .filter((f) => !f.includes('node_modules') && !f.includes('.git'))
      .slice(0, 3);

    for (const filePath of relatedPaths) {
      try {
        const content = await readWorkspaceFile(filePath);
        contextParts.push(
          `RELATED FILE: ${filePath}\n\`\`\`\n${content.slice(0, 3_000)}\n\`\`\``,
        );
        filesRead.push(filePath);
      } catch { /* skip unreadable */ }
    }
  } catch { /* search failure is non-fatal */ }

  /* ── Build messages ──────────────────────────────────────────────────── */
  onStatus?.('🤖 Generating patches…');

  const userContent = `TASK: ${instruction}

${contextParts.join('\n\n---\n\n')}

Respond with ONLY the JSON object.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  /* ── Try each slot ───────────────────────────────────────────────────── */
  for (const slot of slots) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callProvider(slot, messages);
        // Strip markdown fences if the LLM wrapped its response
        const cleaned = raw
          .replace(/^```(?:json)?\s*/im, '')
          .replace(/\s*```\s*$/m, '')
          .trim();

        const parsed = JSON.parse(cleaned) as Partial<AgentResponse>;
        if (typeof parsed.message === 'string' && Array.isArray(parsed.patches)) {
          return { message: parsed.message, patches: parsed.patches, filesRead };
        }

        // Malformed — ask once more
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content:
            'Your response was not valid JSON with "message" and "patches" fields. ' +
            'Reply with ONLY the JSON object.',
        });
      } catch {
        // Try next attempt / next slot
      }
    }
  }

  return {
    message: 'The AI could not generate a valid patch response. Please try rephrasing your request.',
    patches: [],
    filesRead,
  };
}

/* ─── Apply a single patch to file content ──────────────────────────────── */
export function applyPatch(content: string, patch: Pick<FilePatch, 'search' | 'replace'>): string | null {
  if (!content.includes(patch.search)) return null;
  // Replace only the first occurrence to be safe
  return content.replace(patch.search, patch.replace);
}
