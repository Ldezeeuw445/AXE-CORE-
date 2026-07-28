import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const HABIT_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'habit_log',
    marker: 'HABIT_LOG',
    shortForm: '[HABIT_LOG:]',
    gate: 'auto',
    pattern: /\[HABIT_LOG:\s*(\{[^\]]{1,400}\})\s*\]/,
    stripPattern: /\[HABIT_LOG:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📊 **Log progress on a daily habit/goal card** (right panel):\n\`[HABIT_LOG: {"label":"journal","value":1}]\`\n\`label\` fuzzy-matches an existing habit (e.g. "journal", "steps", "trade", "sleep"); \`value\` is the new absolute total for today (not a delta). Use when Luka reports progress in chat.\nExample: "Zet trade op 2 uur. [HABIT_LOG: {"label":"trade","value":2}]"`,
  },
  {
    id: 'habit_status',
    marker: 'HABIT_STATUS',
    shortForm: '[HABIT_STATUS]',
    gate: 'auto',
    pattern: /\[HABIT_STATUS:?\s*\]/,
    stripPattern: /\[HABIT_STATUS:?\s*\]/g,
    promptDoc: `📊 **Read today's habit/goal progress**:\n\`[HABIT_STATUS]\`\nReturns every habit card's current/goal for today.`,
  },
];
