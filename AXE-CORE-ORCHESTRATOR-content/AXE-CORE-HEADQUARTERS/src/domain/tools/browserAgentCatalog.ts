import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const BROWSER_AGENT_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'browser_agent',
    marker: 'BROWSER_AGENT',
    shortForm: '[BROWSER_AGENT:]',
    gate: 'approval',
    approvalKind: 'agent',
    pattern: /\[BROWSER_AGENT:\s*"([^"]{1,500})"\s*\]/,
    stripPattern: /\[BROWSER_AGENT:\s*"[^"]*"\s*\]/g,
    promptDoc: `🌐 **Drive a real browser** — navigate, click, type, read, on an actual headless Chromium (Playwright, VPS-side), not a fetch-and-read-text: \`[BROWSER_AGENT: "book me a table for 2 tonight at 8pm on OpenTable"]\`
Same mandatory-approval contract as [EXEC:]/[AGENT:] — this can click real buttons and submit real forms, so it's never auto-run. Runs a multi-turn loop (up to 6 steps: navigate → read → click/type → read → …) and reports back what it actually did with the real resulting page state each turn — never claim an action succeeded without that real feedback. Previously only reachable from the Browser page's own panel; this marker is the same engine, usable straight from chat. If it hits a wall (login required, CAPTCHA, selector not found) it says so honestly and stops rather than guessing.
Example: "Ik ga dat voor je opzoeken. [BROWSER_AGENT: "search nu.nl for today's weather in Amsterdam and read the forecast"]"`,
  },
];
