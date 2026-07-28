/** SmartThings tool runtimes — list devices + send commands (gated). */
import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import {
  smartThingsConfigured,
  listSmartThingsDevices,
  formatDeviceList,
  executeDeviceCommand,
  getDeviceStatus,
} from '@/infrastructure/gateways/smartThingsService';

export interface StToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: string, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.smartthings: no catalog entry for '${id}'`);
  return entry;
}

export const SMARTTHINGS_TOOL_RUNTIMES: StToolRuntime[] = [
  {
    ...catalogEntry('st_list'),
    available: () => smartThingsConfigured(),
    run: async () => {
      const devices = await listSmartThingsDevices();
      return `ST_LIST (${devices.length} devices):\n${formatDeviceList(devices)}`;
    },
    onError: (msg) => `ST_LIST failed: ${msg}`,
  },
  {
    ...catalogEntry('st_status'),
    available: () => smartThingsConfigured(),
    run: async (raw) => {
      const deviceId = raw.trim().replace(/^"|"$/g, '');
      if (!deviceId) return 'ST_STATUS failed: need deviceId';
      const status = await getDeviceStatus(deviceId);
      return `ST_STATUS ${deviceId}:\n${JSON.stringify(status, null, 2).slice(0, 4000)}`;
    },
    onError: (msg) => `ST_STATUS failed: ${msg}`,
  },
  {
    ...catalogEntry('st_command'),
    available: () => smartThingsConfigured(),
    run: async (raw, ctx) => {
      let deviceId = '';
      let capability = '';
      let command = '';
      let args: unknown[] = [];
      let component = 'main';
      try {
        const p = JSON.parse(raw) as Record<string, unknown>;
        if (typeof p.deviceId === 'string') deviceId = p.deviceId.trim();
        if (typeof p.capability === 'string') capability = p.capability.trim();
        if (typeof p.command === 'string') command = p.command.trim();
        if (Array.isArray(p.arguments)) args = p.arguments;
        if (typeof p.component === 'string') component = p.component;
      } catch {
        return 'ST_COMMAND failed: need JSON {"deviceId","capability","command","arguments"?}';
      }
      if (!deviceId || !capability || !command) {
        return 'ST_COMMAND failed: deviceId, capability, and command are required.';
      }
      const detail = `${capability}/${command} on ${deviceId}${args.length ? ` args=${JSON.stringify(args)}` : ''}`;
      const approved = await ctx.requestApproval(
        'smart_home',
        `AXE wants to control SmartThings: ${command}`,
        detail,
      );
      if (!approved) {
        return `ST_COMMAND was NOT approved by Luka. Do not retry without asking.`;
      }
      await executeDeviceCommand(deviceId, capability, command, args, component);
      return `ST_COMMAND ok -> ${detail}`;
    },
    onError: (msg) => `ST_COMMAND failed: ${msg}`,
  },
];
