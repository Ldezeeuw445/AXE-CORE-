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
/**
 * The shape of a tool as the model sees it.
 *
 * This lived in infrastructure/gateways/llmToolGateway and was imported back
 * up into domain, which the architecture test correctly flagged: domain is not
 * allowed to know about infrastructure, and a tool definition is a domain fact
 * -- what a tool IS -- not a transport detail. The gateway that sends it over
 * the wire imports it from here now, which is the direction the dependency was
 * always meant to run.
 */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema object. Keep it small — every property costs prompt budget. */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: false;
  };
}

const str = (desc: string) => ({ type: 'string', description: desc });
const num = (desc: string) => ({ type: 'number', description: desc });
const strArr = (desc: string) => ({ type: 'array', items: { type: 'string' }, description: desc });

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
  computer_read:   { properties: {
                                   tool: str('Read-only tool id, e.g. screen.observe, screen.displays, pointer.position, app.list, window.list, git.status, files.read.'),
                                   path: str('Path, for files.* / personal.files.list. Optional.'),
                                   workspace: str('Workspace for repo-scoped tools. Optional.'),
                                   device: str('Target Mac id or label. Optional; preferred Mac is used when unambiguous.'),
                                   query: str('Search text, for files.search. Optional.'),
                                   prompt: str('Question for screen.observe vision analysis. Optional.'),
                                   display_index: num('Display index for screen.observe. Optional, defaults to 0.')
                                 },
                     required: ['tool'] },
  computer_run:    { properties: {
                                   tool: str('Mutating device/repo tool id, e.g. pointer.click, keyboard.type, app.open, git.commit.'),
                                   path: str('Path, for files.* tools. Optional.'),
                                   content: str('New file contents, for files.write. Optional.'),
                                   command: str('Command, for terminal.*. Optional.'),
                                   message: str('Commit message, for git.commit. Optional.'),
                                   workspace: str('Workspace for repo-scoped tools. Optional.'),
                                   device: str('Target Mac id or label. Optional; preferred Mac is used when unambiguous.'),
                                   x: num('Global Quartz X coordinate in logical points. Optional.'),
                                   y: num('Global Quartz Y coordinate in logical points. Optional.'),
                                   image_x: num('X pixel in the last screen.observe image. Prefer this with display_index for Retina-safe clicks. Optional.'),
                                   image_y: num('Y pixel in the last screen.observe image. Prefer this with display_index for Retina-safe clicks. Optional.'),
                                   from_x: num('Drag start global X. Optional.'),
                                   from_y: num('Drag start global Y. Optional.'),
                                   to_x: num('Drag end global X. Optional.'),
                                   to_y: num('Drag end global Y. Optional.'),
                                   from_image_x: num('Drag start X pixel in observed image. Optional.'),
                                   from_image_y: num('Drag start Y pixel in observed image. Optional.'),
                                   to_image_x: num('Drag end X pixel in observed image. Optional.'),
                                   to_image_y: num('Drag end Y pixel in observed image. Optional.'),
                                   display_index: num('Display index used by image coordinates. Optional, defaults to 0.'),
                                   dx: num('Horizontal scroll delta. Optional.'),
                                   dy: num('Vertical scroll delta. Optional.'),
                                   text: str('Text for keyboard.type. Optional.'),
                                   key: str('Key name for keyboard.key. Optional.'),
                                   modifiers: strArr('Modifier names for keyboard.key: command, shift, option, control, fn. Optional.'),
                                   app: str('Application name or bundle id for app.open/app.focus. Optional.')
                                 },
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
  if (id === 'computer_read') {
    return 'Observe the selected Mac. Use screen.observe for a fresh grounded screenshot; use it before and after meaningful GUI actions. Never answer what is on screen from memory.';
  }
  if (id === 'computer_run') {
    return 'Perform one bounded action on the selected Mac. For GUI work, observe first, perform the smallest action, then observe again before continuing. Actions stay approval-gated by AXE risk policy.';
  }
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
