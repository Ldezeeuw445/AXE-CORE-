import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const RING_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'ring_log',
    marker: 'RING_LOG',
    shortForm: '[RING_LOG:]',
    gate: 'auto',
    pattern: /\[RING_LOG:\s*(\{[^\]]{1,800}\})\s*\]/,
    stripPattern: /\[RING_LOG:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `💍 **Log smart-ring snapshot** (Da Rings / any ring) into the Home right-panel widget:
\`[RING_LOG: {"steps":8200,"heartRate":72,"spo2":98,"sleepHours":7.2,"battery":80,"hrv":45,"stress":30,"calories":420,"note":"ochtend"}]\`
All fields optional except at least one metric. Use when Luka reads numbers from the Da Rings app and wants them on the dashboard. No live API exists for Da Rings — this is the integration path.
Example: "Ik zet je ring bij. [RING_LOG: {"steps":5400,"heartRate":68}]"`,
  },
  {
    id: 'ring_status',
    marker: 'RING_STATUS',
    shortForm: '[RING_STATUS]',
    gate: 'auto',
    pattern: /\[RING_STATUS:?\s*\]/,
    stripPattern: /\[RING_STATUS:?\s*\]/g,
    promptDoc: `💍 **Read latest smart-ring snapshot**:\n\`[RING_STATUS]\`\nReturns the last logged vitals shown in the right panel.`,
  },
];
