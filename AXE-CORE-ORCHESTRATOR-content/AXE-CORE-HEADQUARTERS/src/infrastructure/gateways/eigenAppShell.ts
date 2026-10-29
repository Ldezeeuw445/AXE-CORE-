/**
 * Een eigen app openen in zijn eigen shell: hier, op een ander scherm, of op
 * een andere Mac.
 *
 * Wat, waar en hoe groot beslist domain/eigenApps.ts. Dit bestand doet het:
 *
 *   * Mac (Tauri): een eigen OS-venster per app (`axe-app-<id>`) op de gekozen
 *     monitor, Companion op telefoon- of iPad-maat. Bestaat het venster al, dan
 *     gaat hetzelfde venster naar dat scherm, in plaats van een tweede.
 *   * Web (iPad-PWA, telefoon): een eigen site in een nieuwe tab, een
 *     AXE-pagina door ernaartoe te gaan. Een tweede OS-venster kan daar niet.
 *   * Een andere Mac: een `core_tasks`-rij (`axe_shell`, `pending`) met dat
 *     toestel als target_device. Het hoofdvenster van AXE op die Mac pakt hem
 *     op (luisterNaarShellOpdrachten) en opent hem daar. Zelfde transport als
 *     computerRelay: niets luistert op een poort.
 */
import { sessieClient } from '@/infrastructure/supabase/supabaseClient';
import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import { ditToestel } from '@/infrastructure/gateways/axeDeviceService';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { routeVanPagina } from '@/domain/navRegistry';
import {
  SHELL_CAPABILITY,
  eigenApp,
  monitorIndexVoor,
  shellOpdracht,
  shellRechthoek,
  toestelVoor,
  type EigenApp,
  type Plek,
  type ShellVorm,
  type ToestelRij,
} from '@/domain/eigenApps';

const OPDRACHT_POLL_MS = 3_000;
/** Een opdracht die zo lang niemand oppakte is van een Mac die uit stond: niet alsnog openen. */
const OPDRACHT_TE_OUD_MS = 10 * 60_000;

interface RegisterRij { name: string; prod_url: string | null; enabled: boolean | null }

/** De live URL uit registered_apps als die er staat, anders de vaste. Hoofdletters tellen niet ("Axon Memory"). */
async function urlVoor(app: EigenApp): Promise<string | null> {
  if (!app.url) return null;
  if (!app.registerNaam) return app.url;
  try {
    const rijen = await sbGetRows<RegisterRij>('registered_apps', { limit: 50 });
    const rij = rijen.find(r => r.enabled !== false && r.name?.toLowerCase() === app.registerNaam!.toLowerCase());
    return rij?.prod_url?.trim() || app.url;
  } catch {
    return app.url;
  }
}

async function openHier(app: EigenApp, plek: Plek): Promise<string> {
  const vorm: ShellVorm = plek.vorm ?? app.vorm;
  const url = app.pagina ? null : await urlVoor(app);
  if (!isTauriRuntime()) {
    if (app.pagina) {
      window.location.hash = `#${routeVanPagina(app.pagina)}`;
      return `${app.naam} opened here`;
    }
    window.open(url!, '_blank', 'noopener,noreferrer');
    return `${app.naam} opened in a new tab`;
  }

  const { availableMonitors, currentMonitor } = await import('@tauri-apps/api/window');
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
  const monitoren = (await availableMonitors()).sort((a, b) => a.position.x - b.position.x);
  if (!monitoren.length) throw new Error('No monitor available.');
  const huidige = await currentMonitor().catch(() => null);
  const huidigIndex = huidige ? Math.max(0, monitoren.findIndex(m => m.position.x === huidige.position.x && m.position.y === huidige.position.y)) : 0;
  const index = monitorIndexVoor(plek.scherm, huidigIndex, monitoren.length);
  const m = monitoren[index];
  const schaal = m.scaleFactor || 1;
  const r = shellRechthoek(vorm, {
    x: m.position.x / schaal, y: m.position.y / schaal, breedte: m.size.width / schaal, hoogte: m.size.height / schaal,
  });
  const scherm = m.name ?? `display ${index + 1}`;

  const label = `axe-app-${app.id}`;
  const bestaand = await WebviewWindow.getByLabel(label);
  if (bestaand) {
    await bestaand.setSize(new LogicalSize(r.breedte, r.hoogte));
    await bestaand.setPosition(new LogicalPosition(r.x, r.y));
    await bestaand.unminimize().catch(() => undefined);
    await bestaand.show();
    await bestaand.setFocus();
    return `${app.naam} moved to ${scherm}`;
  }
  // HashRouter: een AXE-pagina staat op #/pagina, net als in windowManagerService.
  const doel = app.pagina ? `index.html#${routeVanPagina(app.pagina)}` : url!;
  const venster = new WebviewWindow(label, {
    url: doel,
    title: app.naam,
    x: r.x, y: r.y, width: r.breedte, height: r.hoogte,
    theme: 'dark', decorations: true, resizable: true, center: false,
  });
  await new Promise<void>((resolve, reject) => {
    venster.once('tauri://created', () => resolve());
    venster.once('tauri://error', e => reject(new Error(String(e.payload))));
  });
  return `${app.naam} opened on ${scherm}${vorm === 'bureaublad' ? '' : vorm === 'telefoon' ? ' (phone size)' : ' (iPad size)'}`;
}

async function toestellen(): Promise<ToestelRij[]> {
  const sb = await sessieClient();
  if (!sb) throw new Error('not signed in');
  const { data, error } = await sb.from('core_axe_devices').select('device_id, device_name, platform, last_seen').limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ToestelRij[];
}

/**
 * Open een eigen app. `plek` zegt waar (default: dit scherm, deze Mac).
 * Geeft één zin terug die AXE of een knop kan tonen; gooit bij een echte fout.
 */
export async function openEigenApp(id: string, plek: Partial<Plek> = {}): Promise<string> {
  const app = eigenApp(id);
  if (!app) throw new Error(`Unknown app "${id}".`);
  const volledig: Plek = { scherm: plek.scherm ?? 'dit', toestel: plek.toestel ?? 'hier', ...(plek.vorm ? { vorm: plek.vorm } : {}) };
  if (volledig.toestel === 'hier') return openHier(app, volledig);

  const [rijen, ik] = await Promise.all([toestellen(), ditToestel()]);
  const doel = toestelVoor(volledig.toestel, rijen, Date.now());
  const naam = volledig.toestel === 'imac' ? 'iMac' : 'Mac mini';
  if (!doel) throw new Error(`The ${naam} is not online in AXE right now (no heartbeat in the last 2 minutes).`);
  if (doel.device_id === ik.device_id) return openHier(app, { ...volledig, toestel: 'hier' });
  const sb = await sessieClient();
  if (!sb) throw new Error('not signed in');
  const { error } = await sb.from('core_tasks').insert(
    shellOpdracht(app, volledig, doel, import.meta.env.VITE_AXE_USER_UUID as string | undefined),
  );
  if (error) throw new Error(error.message);
  return `${app.naam} is opening on the ${naam}`;
}

/**
 * Het hoofdvenster van AXE op deze Mac voert opdrachten van andere toestellen
 * uit. Claimt alleen rijen voor dit toestel, en alleen als ze nog `pending`
 * zijn, zodat twee vensters of twee rondes hem nooit twee keer openen.
 * Geeft een stopfunctie terug.
 */
export function luisterNaarShellOpdrachten(): () => void {
  if (!isTauriRuntime()) return () => undefined;
  let stop = false;
  let bezig = false;
  const ronde = async () => {
    if (stop || bezig) return;
    bezig = true;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      if (getCurrentWindow().label !== 'main') { stop = true; return; }
      const sb = await sessieClient();
      if (!sb) return;
      const ik = (await ditToestel()).device_id;
      const { data } = await sb.from('core_tasks')
        .select('id, payload, created_at')
        .eq('capability', SHELL_CAPABILITY).eq('status', 'pending').eq('target_device', ik)
        .order('created_at', { ascending: true }).limit(5);
      for (const rij of (data ?? []) as { id: string; payload: { app?: string; scherm?: Plek['scherm']; vorm?: ShellVorm | null }; created_at: string }[]) {
        const nu = new Date().toISOString();
        if (Date.now() - Date.parse(rij.created_at) > OPDRACHT_TE_OUD_MS) {
          await sb.from('core_tasks').update({ status: 'cancelled', cancelled_at: nu, error: { message: 'Not picked up within 10 minutes; this Mac was off.' } })
            .eq('id', rij.id).eq('status', 'pending');
          continue;
        }
        const { data: geclaimd } = await sb.from('core_tasks').update({ status: 'running', started_at: nu })
          .eq('id', rij.id).eq('status', 'pending').select('id');
        if (!geclaimd?.length) continue;
        try {
          const tekst = await openHier(eigenApp(rij.payload.app ?? '') ?? (() => { throw new Error(`unknown app ${rij.payload.app}`); })(),
            { scherm: rij.payload.scherm ?? 'dit', toestel: 'hier', ...(rij.payload.vorm ? { vorm: rij.payload.vorm } : {}) });
          await sb.from('core_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), result: { text: tekst } }).eq('id', rij.id);
        } catch (e) {
          await sb.from('core_tasks').update({ status: 'failed', error: { message: `Could not open: ${String((e as Error)?.message ?? e)}` } }).eq('id', rij.id);
        }
      }
    } catch (e) {
      console.warn('[eigenAppShell] opdrachten niet gelezen', e);
    } finally {
      bezig = false;
    }
  };
  void ronde();
  const iv = window.setInterval(() => void ronde(), OPDRACHT_POLL_MS);
  return () => { stop = true; window.clearInterval(iv); };
}
