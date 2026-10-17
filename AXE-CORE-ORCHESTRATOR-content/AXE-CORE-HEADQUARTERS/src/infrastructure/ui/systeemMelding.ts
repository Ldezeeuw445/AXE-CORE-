/**
 * Systeemmeldingen écht tonen. Wát er getoond wordt staat in
 * domain/systeemMelding.ts; hier alleen de aanroep.
 *
 * Alleen in de Tauri-app (macOS-meldingscentrum via tauri-plugin-notification).
 * De PWA en de telefoon krijgen hun meldingen al via web-push van de service
 * worker; daar zou dit dubbel zijn. De plugin wordt pas geladen als hij nodig
 * is, zodat de webbundel er niets van merkt.
 *
 * Toestemming wordt één keer per sessie gevraagd. Weigert macOS, dan blijft de
 * bel gewoon werken; wie het later in Systeeminstellingen aanzet, krijgt de
 * meldingen vanaf de volgende verversing, omdat de stand elke keer opnieuw
 * wordt nagevraagd.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import type { SysteemMelding } from '@/domain/systeemMelding';

let gevraagd = false;

async function magMelden(plugin: typeof import('@tauri-apps/plugin-notification')): Promise<boolean> {
  if (await plugin.isPermissionGranted()) return true;
  if (gevraagd) return false;
  gevraagd = true;
  return (await plugin.requestPermission()) === 'granted';
}

/** Gooit nooit: een melding die niet lukt mag de bel niet meenemen. */
export function toonSysteemMeldingen(meldingen: readonly SysteemMelding[]): void {
  if (meldingen.length === 0 || !isTauriRuntime()) return;
  void (async () => {
    const plugin = await import('@tauri-apps/plugin-notification');
    if (!(await magMelden(plugin))) return;
    for (const m of meldingen) plugin.sendNotification({ title: m.title, body: m.body || undefined });
  })().catch(() => {});
}
