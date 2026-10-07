/**
 * De twee stem-tools die AXE een lichaam geven: iets op Home laten zien, en
 * iets op Luka's Mac doen.
 *
 * Tot 7 okt had de stem alleen tools die praten over werk (taak starten,
 * status, annuleren, goedkeuren, geheugen). Vroeg Luka "open Safari", dan zei
 * het model eerlijk dat het dat niet kon -- de regel in prompts.ts stuurde
 * alles wat op de computer gebeurt naar de getypte chat. Getypt kon het wel
 * (`[COMPUTER_RUN: app.open]`), dus de stem was dommer dan het toetsenbord.
 *
 * Beide tools hergebruiken bestaande paden en bouwen niets na:
 *  - laten zien = dezelfde resolvers als de chat-regisseur (kaart, grafiek,
 *    web) en dezelfde projectie-store die de bol leest;
 *  - computer = dezelfde COMPUTER-runtimes als de getypte chat, met dezelfde
 *    goedkeuringskaart (`requestActionApproval`) en dezelfde risicoladder.
 *
 * Dit bestand wordt pas geladen als zo'n tool echt aangeroepen wordt, zodat de
 * stem-installer licht blijft (en zijn tests geen Supabase hoeven te mocken).
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { tierFor, UnknownToolError } from '@/domain/tools/riskTiers';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { resolveShownContent } from '@/application/sphere/projectionResolvers/contentResolver';
import { COMPUTER_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.computer';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { requestActionApproval } from '@/presentation/store/voiceStore';

type Args = Record<string, unknown>;

function str(args: Args, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
}

function opDeBol(proj: ProjectionPayload): void {
  useCoreViewStore.getState().setCoreView('axe');
  useSphereProjectionStore.getState().project(proj);
}

export async function toolShowOnHome(args: Args): Promise<string> {
  const query = str(args, 'query');
  if (!query) return JSON.stringify({ ok: false, message: 'Nothing to show — give a query.' });
  const kind = str(args, 'kind') || 'web';
  const proj = kind === 'map'
    ? await resolveMap(query)
    : kind === 'chart'
      ? await resolveChart(query)
      : await resolveShownContent(`show ${query}`);
  if (!proj) return JSON.stringify({ ok: false, message: `Could not find anything to show for "${query}".` });
  opDeBol(proj);
  return JSON.stringify({
    ok: true,
    message: `It is on Home now: ${proj.title}.`,
    // Het model moet kunnen zeggen wat er staat, niet alleen dát er iets staat.
    content: (proj.text ?? '').slice(0, 1500),
  });
}

/** Het bestand dat net gelezen is als document op de bol. */
function bestandOpDeBol(pad: string, inhoud: string): void {
  const naam = pad.split('/').filter(Boolean).pop() || pad;
  opDeBol({
    mode: /\.(ts|tsx|js|py|rs|json|sh|css|sql|md)$/i.test(naam) && !/\.md$/i.test(naam) ? 'code' : 'document',
    title: naam.slice(0, 64),
    subtitle: pad.slice(0, 120),
    text: inhoud.slice(0, 24_000),
    source: 'tool',
    id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  });
}

export async function toolUseComputer(args: Args): Promise<string> {
  const tool = str(args, 'tool');
  if (!tool) return JSON.stringify({ ok: false, message: 'Which computer tool? e.g. app.open.' });
  let toolArgs: Args = {};
  const ruw = args.args;
  if (ruw && typeof ruw === 'object') toolArgs = ruw as Args;
  else if (typeof ruw === 'string' && ruw.trim()) {
    try { toolArgs = JSON.parse(ruw) as Args; } catch { /* lege args; de runtime meldt wat er mist */ }
  }

  let tier;
  try {
    tier = tierFor(tool);
  } catch (e) {
    if (e instanceof UnknownToolError) return JSON.stringify({ ok: false, message: e.message });
    throw e;
  }
  const runtime = COMPUTER_TOOL_RUNTIMES.find(r => r.id === (tier === 'observe' ? 'computer_read' : 'computer_run'));
  if (!runtime) return JSON.stringify({ ok: false, message: 'Computer tools are not loaded.' });

  const raw = JSON.stringify({ ...toolArgs, tool });
  const result = await runtime.run(raw, { requestApproval: requestActionApproval });
  const mislukt = /^COMPUTER( failed| refused|:)/.test(result);

  if (!mislukt && tool === 'files.read' && typeof toolArgs.path === 'string') {
    bestandOpDeBol(toolArgs.path, result);
  }
  return JSON.stringify({ ok: !mislukt, result: result.slice(0, 4000) });
}
