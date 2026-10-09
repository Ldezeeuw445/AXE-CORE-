/**
 * De rest van AXE's handen voor de stem: het hele gereedschapsregister, de verbonden diensten en een
 * overzicht van hoe het ervoor staat.
 *
 * Tot 9 okt had de stemlijn tien dingen die hij kon (taak, status, geheugen, laten zien, computer…),
 * terwijl de getypte chat het hele register had: web zoeken en lezen, de VPS, GitHub, de database,
 * de telefoon, het huis, Obsidian, de browser-agent, onderzoek. Vroeg Luka iets daarvan hardop, dan zei
 * AXE eerlijk "dat kan ik niet" -- terwijl dezelfde vraag getypt gewoon werkte. De stem was dommer dan
 * het toetsenbord.
 *
 * Dit bouwt niets na: elke registertool loopt door dezelfde uitvoerder (`runToolCall`), met dezelfde
 * goedkeuringskaart, dezelfde risicoladder en dezelfde gebeurtenissenlog als getypt. Wat gedekt wordt
 * door een eigen stemtool (computer, achtergrondtaken) blijft daar.
 *
 * Wordt pas geladen als de stem een sessie opent of zo'n tool aanroept, zodat de installer licht blijft.
 */
import { TOOL_RUNTIMES } from '@/application/tools/toolRegistry';
import { runToolCall } from '@/application/tools/nativeToolLoop';
import { toolDefs } from '@/domain/tools/toolSchemas';
import { requestActionApproval } from '@/presentation/store/voiceStore';
import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';
import {
  lockscreenSnapshot, mcpHubLijst, mcpHubTest, mcpHubRoep,
} from '@/infrastructure/gateways/axeCoreApiService';
import type { RealtimeToolDef } from '@/infrastructure/gateways/openAiRealtimeVoice';

type Args = Record<string, unknown>;

/** Hebben een eigen stemtool, of zijn dubbel met start_background_task: niet nog eens aanbieden. */
const EIGEN_STEMTOOL = new Set(['computer_read', 'computer_run', 'agent', 'crew']);

function str(args: Args, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** De registertools die op dit moment echt kunnen draaien, als stemtools. */
export function registerStemTools(): RealtimeToolDef[] {
  const beschikbaar = new Set(TOOL_RUNTIMES.filter(r => r.available()).map(r => r.id));
  return toolDefs()
    .filter(d => beschikbaar.has(d.name) && !EIGEN_STEMTOOL.has(d.name))
    .map(d => ({ name: d.name, description: d.description, parameters: d.parameters as unknown as Record<string, unknown> }));
}

/** Wat er in dit register staat maar nu niet kan (niet ingesteld, of zijn backend ligt eruit). */
export function uitgezetteTools(): string[] {
  return TOOL_RUNTIMES.filter(r => !r.available() && !EIGEN_STEMTOOL.has(r.id)).map(r => r.id);
}

export function isRegisterTool(naam: string): boolean {
  return !EIGEN_STEMTOOL.has(naam) && TOOL_RUNTIMES.some(r => r.id === naam);
}

/** Eén registertool, door dezelfde uitvoerder als de getypte chat. */
export async function runRegisterTool(naam: string, args: Args): Promise<string> {
  const r = await runToolCall(
    { id: `rt_${Date.now().toString(36)}`, name: naam, input: args },
    { requestApproval: requestActionApproval, record: e => recordEvent({ ...e, details: { ...e.details, via: 'voice' } }) },
  );
  return JSON.stringify({ ok: r.ok, result: r.output.slice(0, 4000) });
}

// ── Verbonden diensten (de MCP-hub) ──────────────────────────────────────

/** Een tool die iets verandert of verstuurt. Alles wat hier niet op past is lezen en loopt direct. */
const SCHRIJVEND = /(create|update|delete|remove|send|write|insert|upsert|deploy|push|merge|apply|execute|run_|set_|put_|publish|drop|revoke|invite|approve|cancel|reply|forward|migrat|restart|rollback|reset|archive|transfer|pay)/i;

export function isSchrijvendeMcpTool(tool: string): boolean {
  return SCHRIJVEND.test(tool);
}

export async function toolConnectedService(args: Args): Promise<string> {
  const actie = str(args, 'action') || 'list';
  if (actie === 'list') {
    const { servers } = await mcpHubLijst();
    return JSON.stringify({
      ok: true,
      services: servers.map(s => ({ id: s.id, name: s.naam, about: s.uitleg, ready: s.klaar })),
    });
  }
  const service = str(args, 'service');
  if (!service) return JSON.stringify({ ok: false, message: 'Which service? Use action "list" to see them.' });

  if (actie === 'tools') {
    const t = await mcpHubTest(service);
    if (t.status !== 'online') return JSON.stringify({ ok: false, message: `${service} is ${t.status}${t.fout ? ` — ${t.fout}` : ''}.` });
    return JSON.stringify({ ok: true, tools: (t.tools ?? []).map(x => ({ name: x.name, about: x.description.slice(0, 140) })) });
  }

  if (actie === 'call') {
    const tool = str(args, 'tool');
    if (!tool) return JSON.stringify({ ok: false, message: 'Which tool? Use action "tools" first.' });
    const toolArgs = args.args && typeof args.args === 'object' ? args.args as Args : {};
    if (isSchrijvendeMcpTool(tool)) {
      const ja = await requestActionApproval(
        'exec', `AXE wants to use ${service}: ${tool}`, JSON.stringify(toolArgs, null, 2).slice(0, 600),
      );
      if (!ja) return JSON.stringify({ ok: false, message: 'Luka did not approve it, so nothing was done.' });
    }
    const r = await mcpHubRoep(service, tool, toolArgs);
    recordEvent({
      kind: r.status === 'ok' || r.result !== undefined ? 'tool_call' : 'error',
      summary: `mcp ${service}.${tool}`,
      details: { tool: `mcp:${service}.${tool}`, args: JSON.stringify(toolArgs).slice(0, 500), via: 'voice' },
    });
    if (r.error) return JSON.stringify({ ok: false, message: r.error });
    return JSON.stringify({ ok: true, result: JSON.stringify(r.result ?? r).slice(0, 4000) });
  }
  return JSON.stringify({ ok: false, message: 'action is list, tools or call.' });
}

// ── Hoe staat het ervoor ──────────────────────────────────────────────────

export async function toolGetOverview(): Promise<string> {
  const s = await lockscreenSnapshot();
  return JSON.stringify({
    ok: true,
    needs_attention: s.attention.slice(0, 8).map(a => ({
      what: a.title, times: a.count, severity: a.severity,
      minutes_ago: a.ago_s == null ? null : Math.round(a.ago_s / 60),
    })),
    attention_total: s.attention_total,
    machines: s.systems.map(m => ({ name: m.name, online: m.online, cpu: m.cpu, ram: m.mem, disk: m.disk })),
    services: s.services.map(x => ({ name: x.name, ok: x.ok })),
    markets: s.markets.map(m => ({ symbol: m.label, price: m.price })),
  });
}
