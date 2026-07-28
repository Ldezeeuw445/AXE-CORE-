/** Income ledger tool catalog — merged into TOOL_CATALOG at module load. */
import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const INCOME_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'income_log',
    marker: 'INCOME_LOG',
    shortForm: '[INCOME_LOG:]',
    gate: 'auto',
    pattern: /\[INCOME_LOG:\s*(\{[^\]]{1,600}\})\s*\]/,
    stripPattern: /\[INCOME_LOG:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `💰 **Log income** into Luka's Finance ledger (same data as Finance Hub), no approval needed:
\`[INCOME_LOG: {"source":"prime_opinion","amount":12.5,"currency":"EUR","units":3,"note":"avond sessie"}]\`
Sources: prime_opinion, trading, apps, freelance, salary, crypto, other.
\`units\` = optional count of surveys/items. \`date\` optional (YYYY-MM-DD, defaults today).
Use when Luka says he earned something, cashed out, or finished surveys — log it instead of only acknowledging in chat.
Example: "Ik log het. [INCOME_LOG: {"source":"prime_opinion","amount":8.4,"units":2}]"`,
  },
  {
    id: 'income_summary',
    marker: 'INCOME_SUMMARY',
    shortForm: '[INCOME_SUMMARY]',
    gate: 'auto',
    pattern: /\[INCOME_SUMMARY:?\s*\]/,
    stripPattern: /\[INCOME_SUMMARY:?\s*\]/g,
    promptDoc: `💰 **Income summary** from the Finance ledger, read-only:
\`[INCOME_SUMMARY]\`
Returns this month total, all-time EUR, breakdown by source (incl. Prime Opinion survey units).
Use when Luka asks what he earned, income overview, or Prime Opinion totals.
Example: "Even de ledger checken. [INCOME_SUMMARY]"`,
  },
];
