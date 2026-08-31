/**
 * What is actually built, and what only looks built.
 *
 * This exists because the honest answer to "does the browser tab work?" was
 * nowhere in the app. You clicked it, something rendered, and you could not
 * tell whether you were looking at a finished feature, an empty state, or a
 * page that had quietly fallen over. A tab that renders a shell is
 * indistinguishable from a tab that works — which is how you end up with no
 * idea what your own app does.
 *
 * Two things are deliberately separate here:
 *
 *   - SERVICES are measured. systemService pings them and reports.
 *   - FEATURES are declared. Nothing can ping "is the agents panel good",
 *     so this is a maintained statement of fact, dated, with the evidence.
 *
 * Keeping them apart matters: a measured green and a declared green are not
 * the same promise, and a status page that blurs them is worse than none.
 *
 * Rule for editing: when a feature changes state, change it HERE in the same
 * commit. A registry that lags is a registry that lies.
 */

export type FeatureState =
  /** Built, used, and behaves. */
  | 'works'
  /** Renders and is usable, but visibly unfinished or thin. */
  | 'partial'
  /** Renders but has no real content — a shell or an empty state. */
  | 'empty'
  /** Known broken. */
  | 'broken'
  /** Renders the same thing as another route. */
  | 'duplicate';

export interface Feature {
  /** Hash route, without the leading #/. */
  route: string;
  label: string;
  state: FeatureState;
  /** Why it is in this state. Shown in the UI — no unexplained reds. */
  note: string;
  /** Where the claim came from, so it can be re-checked rather than trusted. */
  evidence?: string;
}

/**
 * Seeded 2026-08-31 by walking every route in the running app and recording
 * what rendered: element counts, headings, error boundaries and console
 * errors. Not from reading the code — from watching it run.
 */
export const FEATURES: Feature[] = [
  // ── working ────────────────────────────────────────────────────────────
  { route: 'trading', label: 'Trading', state: 'works',
    note: 'MT5 via MetaAPI connected, live chart, strategies list.',
    evidence: 'Was crashing until the PositionLabelsOverlay render loop was fixed.' },
  { route: 'settings', label: 'Settings', state: 'works',
    note: 'The densest page in the app.', evidence: '427 controls, 13 cards.' },
  { route: 'knowledge', label: 'Knowledge Base', state: 'works',
    note: 'Real content and search.', evidence: '13 cards, 116k characters.' },
  { route: 'agents', label: 'Agent Center', state: 'works',
    note: 'Renders the agent roster.', evidence: '131 controls.' },
  { route: 'infrastructure', label: 'Infrastructure', state: 'works',
    note: 'Live service checks and table stats.' },
  { route: 'memory', label: 'Memory Overview', state: 'partial',
    note: 'Renders, but everything is one undifferentiated pile — no split '
        + 'between trading memory and the rest.' },
  { route: 'memory/explore', label: '3D Memory Terrain', state: 'partial',
    note: 'Looks right and needs no visual change. The data behind it is the '
        + 'same single heap as Memory Overview.' },
  { route: 'obsidian', label: 'Obsidian Memory', state: 'partial',
    note: 'Shows a handful of notes pulled from global memory rather than a '
        + 'real Obsidian view.' },
  { route: 'mcp', label: 'MCP Center', state: 'works', note: '12 server cards.' },
  { route: 'control-plane', label: 'Control Plane', state: 'works', note: '8 cards.' },
  { route: 'crewai', label: 'CrewAI', state: 'works', note: '6 specialist cards.' },
  { route: 'finance', label: 'Finance Hub', state: 'works', note: '6 cards.' },
  { route: 'maps-3d', label: 'Maps 3D', state: 'works', note: 'Surveillance feed renders.' },
  { route: 'ai-core', label: 'AI Core', state: 'works', note: '8 cards, heaviest text page.' },
  { route: 'cron-manager', label: 'Cron Manager', state: 'partial', note: 'Thin — 16 controls.' },
  { route: 'code-editor', label: 'Code Editor', state: 'partial',
    note: 'The editor itself works; the agents side of it does not yet.' },

  // ── not finished ───────────────────────────────────────────────────────
  { route: 'thinkthanks', label: 'ThinkTank', state: 'broken', note: 'Does not work yet.' },
  { route: 'browser', label: 'Browser', state: 'broken', note: 'Does not work yet.' },
  { route: 'architecture', label: 'Architecture', state: 'partial',
    note: 'A shape with a few things in it. Does not show how the app actually '
        + 'fits together, and nothing can be added to it.' },

  // ── empty ──────────────────────────────────────────────────────────────
  { route: 'tasks', label: 'Tasks', state: 'empty',
    note: 'Renders correctly; there are simply no tasks.', evidence: '0 rows.' },
  { route: 'calendar', label: 'Calendar', state: 'empty', evidence: '178 characters.',
    note: 'Month grid only, no events.' },
  { route: 'table-editor', label: 'Table Editor', state: 'partial',
    note: 'A real 477-line table browser that renders "No rows found" — the '
        + 'data is not arriving, the page is not missing.',
    evidence: '27 characters on screen, 477 lines of source.' },
  { route: 'developer', label: 'Command Center', state: 'partial',
    note: 'A real 251-line repo file browser whose tree fails to load. Same '
        + 'shape as Table Editor: starved, not stubbed.',
    evidence: '152 characters on screen, 251 lines of source.' },
  { route: 'apps', label: 'Apps', state: 'partial', note: 'Small launcher list.' },

  // ── duplicate ──────────────────────────────────────────────────────────
  // /command removed 31-08-2026 — it was a second route onto TerminalPage
  // with no navRegistry entry, so it was only reachable by typing the URL.
  { route: 'terminal', label: 'Terminal', state: 'partial',
    note: 'The shell renders; whether it connects depends on the VPS terminal '
        + 'service, which the Status page shows as offline.',
    evidence: '85 characters.' },
];

export const STATE_META: Record<FeatureState, { label: string; tone: 'ok' | 'warn' | 'err' | 'muted' }> = {
  works:     { label: 'Works',     tone: 'ok' },
  partial:   { label: 'Partial',   tone: 'warn' },
  empty:     { label: 'Empty',     tone: 'muted' },
  broken:    { label: 'Broken',    tone: 'err' },
  duplicate: { label: 'Duplicate', tone: 'muted' },
};

export function countByState(features: Feature[] = FEATURES): Record<FeatureState, number> {
  const out = { works: 0, partial: 0, empty: 0, broken: 0, duplicate: 0 } as Record<FeatureState, number>;
  for (const f of features) out[f.state]++;
  return out;
}
