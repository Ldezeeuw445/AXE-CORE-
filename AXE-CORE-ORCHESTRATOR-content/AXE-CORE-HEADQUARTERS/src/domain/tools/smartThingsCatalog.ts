/** SmartThings tool catalog entries — merged into TOOL_CATALOG at module load. */
import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const SMARTTHINGS_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'st_list',
    marker: 'ST_LIST',
    shortForm: '[ST_LIST]',
    gate: 'auto',
    pattern: /\[ST_LIST:?\s*\]/,
    stripPattern: /\[ST_LIST:?\s*\]/g,
    promptDoc: `🏠 **SmartThings — list devices**, no approval needed (read-only):\n\`[ST_LIST]\`\nReturns device labels and deviceIds. Use before ST_COMMAND so you have real ids. Requires Luka's SmartThings token in Settings / localStorage.\nExample: "Even kijken welke lampen er zijn. [ST_LIST]"`,
  },
  {
    id: 'st_status',
    marker: 'ST_STATUS',
    shortForm: '[ST_STATUS:]',
    gate: 'auto',
    pattern: /\[ST_STATUS:\s*"?([a-f0-9\-]{8,64})"?\]/i,
    stripPattern: /\[ST_STATUS:\s*"?[a-f0-9\-]*"?\]/gi,
    promptDoc: `🏠 **SmartThings — device status**, read-only:\n\`[ST_STATUS: "device-uuid"]\`\nExample: "Status van die lamp. [ST_STATUS: "abc-123"]"`,
  },
  {
    id: 'st_command',
    marker: 'ST_COMMAND',
    shortForm: '[ST_COMMAND:]',
    gate: 'approval',
    approvalKind: 'smart_home',
    pattern: /\[ST_COMMAND:\s*(\{[^\]]{1,800}\})\s*\]/,
    stripPattern: /\[ST_COMMAND:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🏠 **SmartThings — control a device**, same approval contract as EXEC:\n\`[ST_COMMAND: {"deviceId":"...","capability":"switch","command":"on","arguments":[]}]\`\nCommon: capability switch commands on/off; switchLevel setLevel with arguments [50]; colorControl as device supports.\nAlways [ST_LIST] first if you don't know the deviceId. Denied = denied, never silent retry.\nExample: "Lamp uit zodra je akkoord geeft. [ST_COMMAND: {"deviceId":"…","capability":"switch","command":"off"}]"`,
  },
];
