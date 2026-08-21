/**
 * toolRegistry.phone — [PHONE_LOOK:] and [PHONE_DO:] as chat tools.
 *
 * The rails are in `infra/axe-local-bridge/adb.mjs`; this binds them to the
 * chat and decides what AXE is told afterwards. Two decisions worth keeping:
 *
 * 1. **A tap by label is resolved here, against a fresh dump.** The model may
 *    send `{"action":"tap","label":"Inloggen"}` and never handle a coordinate.
 *    Coordinates from an earlier turn are stale the moment the page scrolls,
 *    and a stale tap does not fail — it presses something else, which is far
 *    worse than an error.
 *
 * 2. **The approval card says what will happen, not which endpoint runs.**
 *    "tap Inloggen at 939,342" is reviewable; "PHONE_DO" is not.
 */
import { TOOL_CATALOG, type ToolCatalogEntry, type ApprovalKind } from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerPhoneCatalog';
import {
  isPhoneBridgeConfigured, phoneLook, phoneDo, phoneDevices,
  findElement, formatElements,
  type PhoneElement, type PhoneLookAction, type PhoneDoAction,
} from '@/infrastructure/gateways/phoneBridgeService';

export interface PhoneToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.phone: no catalog entry for '${id}'`);
  return entry;
}

function parseArgs<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

const LOOK_ACTIONS = new Set<PhoneLookAction>(['screenshot', 'ui_dump', 'current_app', 'screen_size']);
const DO_ACTIONS = new Set<PhoneDoAction>(['tap', 'swipe', 'text', 'key', 'open_url', 'launch']);

/** What the approval card shows. Plain words, because Luka is reading it. */
function describe(action: string, p: Record<string, unknown>): string {
  switch (action) {
    case 'tap': return p.label ? `tap "${String(p.label)}"` : `tap at ${p.x},${p.y}`;
    case 'swipe': return `swipe ${p.x1},${p.y1} → ${p.x2},${p.y2}`;
    case 'text': return `type ${JSON.stringify(String(p.text ?? '').slice(0, 60))}`;
    case 'key': return `press ${String(p.key ?? '').toUpperCase()}`;
    case 'open_url': return `open ${String(p.url ?? '')}`;
    case 'launch': return `launch ${String(p.package ?? '')}`;
    default: return action;
  }
}

/** Fresh element list — never cached, see the header. */
async function currentElements(): Promise<PhoneElement[]> {
  const r = await phoneLook('ui_dump');
  return r.elements ?? [];
}

export const PHONE_TOOL_RUNTIMES: PhoneToolRuntime[] = [
  {
    ...catalogEntry('phone_look'),
    available: () => isPhoneBridgeConfigured,
    run: async (raw) => {
      const args = parseArgs<{ action?: string }>(raw);
      const action = (args?.action ?? 'ui_dump') as PhoneLookAction;
      if (!LOOK_ACTIONS.has(action)) {
        return `PHONE_LOOK failed: unknown action "${action}". Use ui_dump, screenshot, current_app or screen_size.`;
      }

      const r = await phoneLook(action);

      if (action === 'ui_dump') {
        const els = r.elements ?? [];
        return [
          `PHONE_LOOK ui_dump (${els.length} elements on ${r.device}):`,
          formatElements(els),
        ].join('\n');
      }
      if (action === 'screenshot') {
        // The bytes are not returned to the model: a base64 PNG is tens of
        // thousands of tokens and ui_dump answers the same question in text.
        // The image is for the panel, which reads it from the bridge itself.
        const kb = Math.round(((r.png?.length ?? 0) * 0.75) / 1024);
        return `PHONE_LOOK screenshot captured (${kb} KB) from ${r.device}. Use ui_dump to read what is on it.`;
      }
      return `PHONE_LOOK ${action} (${r.device}):\n${(r.stdout ?? '').trim()}`;
    },
    onError: (msg) => `Phone bridge look failed: ${msg}`,
  },

  {
    ...catalogEntry('phone_do'),
    available: () => isPhoneBridgeConfigured,
    run: async (raw, ctx) => {
      const args = parseArgs<Record<string, unknown>>(raw);
      if (!args) return 'PHONE_DO failed: malformed arguments.';
      const action = String(args.action ?? '') as PhoneDoAction;
      if (!DO_ACTIONS.has(action)) {
        return `PHONE_DO failed: unknown action "${action}". Use tap, swipe, text, key, open_url or launch.`;
      }

      // Resolve a label to a point BEFORE asking for approval, so the card
      // shows the real target and an unfindable label costs nothing.
      const params: Record<string, unknown> = { ...args };
      if (action === 'tap' && typeof args.label === 'string') {
        const els = await currentElements();
        const hit = findElement(els, args.label);
        if (!hit) {
          const tappable = els.filter(e => e.tap && e.label).slice(0, 25);
          return [
            `PHONE_DO tap failed: nothing on screen matches "${args.label}".`,
            'On screen now:',
            formatElements(tappable, 25),
          ].join('\n');
        }
        params.x = hit.x;
        params.y = hit.y;
      }

      const approved = await ctx.requestApproval(
        'phone',
        'AXE wants to control your phone',
        describe(action, params),
      );
      if (!approved) return `PHONE_DO refused: Luka did not approve ${describe(action, params)}.`;

      delete params.action;
      delete params.label;
      const r = await phoneDo(action, params);

      // Say what happened, then what is on screen now — a tap that lands on
      // the wrong thing reports success at the adb layer, so the follow-up
      // dump is the only honest confirmation.
      const out = (r.stdout ?? '').trim();
      const lines = [`PHONE_DO ${describe(action, { ...params, label: args.label })} -> ok`];
      if (out && !out.startsWith('Starting:')) lines.push(out.slice(0, 500));
      return lines.join('\n');
    },
    onError: (msg) => `Phone bridge action failed: ${msg}`,
  },
];

/** Is a phone actually reachable right now? Used to tell "off" from "broken". */
export async function phoneStatusLine(): Promise<string> {
  if (!isPhoneBridgeConfigured) return 'Phone control: bridge token not set.';
  try {
    const { adb, devices } = await phoneDevices();
    if (!adb) return 'Phone control: adb not installed on this Mac.';
    const ready = devices.filter(d => d.state === 'device');
    if (ready.length === 0) {
      return devices.length
        ? `Phone control: ${devices.map(d => `${d.serial} (${d.state})`).join(', ')} — not usable yet.`
        : 'Phone control: no phone attached.';
    }
    return `Phone control: ${ready.map(d => d.model ?? d.serial).join(', ')} ready.`;
  } catch (err) {
    return `Phone control: bridge unreachable — ${err instanceof Error ? err.message : String(err)}`;
  }
}
