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
  { route: 'memory/trading', label: 'Trading Memory', state: 'works',
    note: 'The trading agent on its own: funnel counts, per-symbol activity, '
        + 'lessons and mistakes.',
    evidence: '14,873 rows that were filed in global_memory under the generic '
            + 'category system_event — 95% of that table.' },
  { route: 'memory', label: 'Memory Overview', state: 'partial',
    note: 'Still one pile for everything that is not trading. The trading half '
        + 'now has its own page at /memory/trading.' },
  { route: 'memory/explore', label: '3D Memory Terrain', state: 'works',
    note: 'Peak height is now the real row count per hub, and Trading is its '
        + 'own region instead of 95% of the Events peak.',
    evidence: 'Heights came from a 500-row sample of the most recent writes, '
            + 'so the terrain drew the last hour rather than the memory.' },
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
  { route: 'browser', label: 'Browser', state: 'partial',
    note: 'Works: real tabs, sidebar, Google and YouTube load. But the '
        + 'browsing happens from the VPS, so everything arrives in German and '
        + 'Reddit blocks it as a datacenter IP.',
    evidence: 'Seen on axeheadquarters.com, 2 Sep 2026, after merging '
            + 'cursor/comet-browser-3292. Was listed as broken before that.' },
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
