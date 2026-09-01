/**
 * The catalog, as tool definitions the model can actually call.
 *
 * One entry per TOOL_CATALOG id. The name matches the catalog id exactly, so
 * a returned tool call maps straight back onto the existing executor and its
 * risk tier — nothing about approvals or gates changes here.
 *
 * ## Why the descriptions are short
 *
 * The marker protocol needed ~3,900 tokens of promptDoc every turn, because
 * the model had to be taught a syntax: where the brackets go, how to quote,
 * what not to write. With native tool calling that is all handled by the API,
 * so a description only has to answer two questions — what does this do, and
 * when should I reach for it. Everything else was scaffolding for a mechanism
 * we are removing.
 *
 * ## Why arguments are named, not generic
 *
 * `{ query: string }` beats `{ input: string }`. The parameter name is one of
 * the strongest hints a model gets about what belongs in the slot, and it is
 * free — it costs the same tokens either way.
 *
 * ## Approvals are unchanged
 *
 * A tool being callable does not make it allowed. The gate and approvalKind on
 * the catalog entry still decide that, and still stop the call before the
 * backend hears about it. This module only changes how the model ASKS.
 */
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import type { ToolDef } from '@/infrastructure/gateways/llmToolGateway';

const str = (desc: string) => ({ type: 'string', description: desc });

/** Argument shape per tool id. Anything not listed falls back to a single string. */
const ARGS: Record<string, { properties: Record<string, unknown>; required: string[] }> = {
  search:          { properties: { query: str('What to search the web for.') }, required: ['query'] },
  fetch:           { properties: { url: str('Full URL to read.') }, required: ['url'] },
  exec:            { properties: { command: str('Shell command to run on the VPS.') }, required: ['command'] },

  local_read:      { properties: { path: str("Absolute path on Luka's machine.") }, required: ['path'] },

  // Computer use. `tool` is the id from the allowlist; the rest is its
  // payload. Note what is NOT here: a `tier` field. The model never states the
  // risk level -- tierFor() resolves it from the tool id after parsing, so a
  // web page that talks AXE into claiming `git.push` is read-only still gets a
  // push approval card. See computerCatalog for the full reasoning.
  computer_read:   { properties: { tool: str('Read-only tool id, e.g. git.status, files.read, files.list, files.search.'),
                                   path: str('Path, for files.* tools. Optional.'),
                                   workspace: str('Which workspace, for git.*. Defaults to the selected one. Optional.'),
                                   query: str('Search text, for files.search. Optional.') },
                     required: ['tool'] },
  computer_run:    { properties: { tool: str('Tool id that changes something, e.g. git.commit, files.write, terminal.run.'),
                                   path: str('Path, for files.* tools. Optional.'),
                                   content: str('New file contents, for files.write. Optional.'),
                                   command: str('Command, for terminal.*. Optional.'),
                                   message: str('Commit message, for git.commit. Optional.'),
                                   workspace: str('Which workspace. Optional.') },
                     required: ['tool'] },
  local_write:     { properties: { path: str('Absolute path to write.'),
                                   content: str('Full new file contents.') }, required: ['path', 'content'] },
  local_run:       { properties: { command: str('One of the allowlisted commands: build, typecheck, test, git.status, git.pull, git.diff, tauri.build.'),
                                   cwd: str('Directory to run in. Optional.') }, required: ['command'] },

  git_read:        { properties: { repo: str('owner/repo.'), path: str('File path in the repo.'),
                                   ref: str('Branch or sha. Optional.') }, required: ['repo', 'path'] },
  git_write:       { properties: { repo: str('owner/repo.'), path: str('File path.'),
                                   content: str('Full new contents.'), branch: str('Branch to commit to — never the production branch.'),
                                   message: str('Commit message.') }, required: ['repo', 'path', 'content', 'branch', 'message'] },
  git_branch:      { properties: { repo: str('owner/repo.'), name: str('New branch name.'),
                                   from: str('Base branch. Optional.') }, required: ['repo', 'name'] },
  git_pr:          { properties: { repo: str('owner/repo.'), head: str('Branch with the changes.'),
                                   base: str('Branch to merge into.'), title: str('PR title.'),
                                   body: str('PR description. Optional.') }, required: ['repo', 'head', 'base', 'title'] },
  git_pr_status:   { properties: { repo: str('owner/repo.'), number: { type: 'number', description: 'PR number.' } }, required: ['repo', 'number'] },
  git_pr_merge:    { properties: { repo: str('owner/repo.'), number: { type: 'number', description: 'PR number.' } }, required: ['repo', 'number'] },

  db_read:         { properties: { table: str('Table name.'), select: str('Columns. Optional.'),
                                   filter: str('PostgREST filter, e.g. status=eq.open. Optional.'),
                                   limit: { type: 'number', description: 'Row cap. Optional.' } }, required: ['table'] },
  db_sql:          { properties: { sql: str('SQL to run against Supabase.') }, required: ['sql'] },

  vercel_status:   { properties: { project: str('Project name. Optional.') }, required: [] },
  vercel_promote:  { properties: { project: str('Project to promote.'), deployment: str('Deployment id. Optional.') }, required: ['project'] },

  osint:           { properties: { query: str('What to look up on the map.') }, required: ['query'] },
  agent:           { properties: { agent: str('Which VPS agent: openhands, openjarvis, openclaw, kilocode.'),
                                   task: str('What it should do.') }, required: ['agent', 'task'] },
  crew:            { properties: { task: str('Task for the CrewAI specialists.') }, required: ['task'] },
  project:         { properties: { target: str('What to project onto the Home sphere.') }, required: ['target'] },
  open_window:     { properties: { url: str('Page to open.'), screen: { type: 'number', description: 'Which display. Optional.' } }, required: ['url'] },

  obsidian_write:  { properties: { title: str('Note title.'), content: str('Note body.'),
                                   folder: str('Folder. Optional.') }, required: ['title', 'content'] },
  obsidian_search: { properties: { query: str('What to look for in the notes.') }, required: ['query'] },
  reflect:         { properties: { text: str('What was learned, in one or two sentences.') }, required: ['text'] },
};

/**
 * Strip the marker documentation down to a description.
 *
 * The promptDoc was written to teach a syntax, so most of it is about brackets
 * and quoting. What survives is the first prose line: what the tool is for.
 */
function describe(id: string, promptDoc: string): string {
  const first = promptDoc.split('\n').find(l => l.trim()) ?? id;
  return first
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')   // leading emoji
    .replace(/\*\*/g, '')
    .replace(/\s*—?\s*(include this marker.*|same mandatory-approval contract.*|no approval needed.*|needs approval.*)$/i, '')
    .replace(/:$/, '')
    .trim();
}

/** Every catalog tool, as a definition the model can call. */
export function toolDefs(): ToolDef[] {
  return TOOL_CATALOG.map(entry => {
    const args = ARGS[entry.id];
    return {
      name: entry.id,
      description: describe(entry.id, entry.promptDoc),
      parameters: {
        type: 'object' as const,
        properties: args?.properties ?? { input: str('Argument for this tool.') },
        required: args?.required ?? ['input'],
        additionalProperties: false as const,
      },
    };
  });
}

/**
 * How much prompt this saves.
 *
 * Exported so the saving is measurable rather than claimed — the marker
 * protocol's cost was the main argument for replacing it, and an argument you
 * cannot check is just a story.
 */
export function promptBudget(): { markerChars: number; schemaChars: number } {
  const markerChars = TOOL_CATALOG.reduce((n, t) => n + t.promptDoc.length, 0);
  const schemaChars = JSON.stringify(toolDefs()).length;
  return { markerChars, schemaChars };
}
