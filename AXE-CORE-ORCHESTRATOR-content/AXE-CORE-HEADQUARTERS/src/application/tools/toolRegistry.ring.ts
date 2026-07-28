import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import {
  getRingSnapshot,
  setRingSnapshot,
  formatRingForContext,
} from '@/infrastructure/persistence/ringSnapshotService';

export interface RingToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: string, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.ring: no catalog entry for '${id}'`);
  return entry;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const RING_TOOL_RUNTIMES: RingToolRuntime[] = [
  {
    ...catalogEntry('ring_log'),
    available: () => true,
    run: async (raw) => {
      let p: Record<string, unknown>;
      try {
        p = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return 'RING_LOG failed: need JSON with at least one metric (steps, heartRate, spo2, …).';
      }
      const partial = {
        steps: num(p.steps),
        heartRate: num(p.heartRate ?? p.hr),
        spo2: num(p.spo2),
        hrv: num(p.hrv),
        stress: num(p.stress),
        calories: num(p.calories),
        sleepScore: num(p.sleepScore),
        sleepHours: num(p.sleepHours ?? p.sleep),
        battery: num(p.battery),
        temperature: num(p.temperature),
        note: typeof p.note === 'string' ? p.note : undefined,
        source: typeof p.source === 'string' ? p.source : 'Da Rings',
      };
      const hasAny = Object.entries(partial).some(([k, v]) => k !== 'source' && k !== 'note' && v != null);
      if (!hasAny) return 'RING_LOG failed: provide at least one numeric metric.';
      const next = await setRingSnapshot(partial);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('axe-ring-updated'));
      return `RING_LOG saved → ${formatRingForContext(next) || JSON.stringify(next)}`;
    },
    onError: (msg) => `RING_LOG failed: ${msg}`,
  },
  {
    ...catalogEntry('ring_status'),
    available: () => true,
    run: async () => {
      const s = await getRingSnapshot();
      if (!s) return 'RING_STATUS: no snapshot yet — log from Da Rings via [RING_LOG:] or the right-panel Update button.';
      return formatRingForContext(s) || JSON.stringify(s);
    },
    onError: (msg) => `RING_STATUS failed: ${msg}`,
  },
];
