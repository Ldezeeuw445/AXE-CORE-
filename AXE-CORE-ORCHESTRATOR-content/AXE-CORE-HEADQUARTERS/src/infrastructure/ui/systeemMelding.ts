/**
 * Systeemmeldingen écht tonen. Wát er getoond wordt staat in
 * domain/systeemMelding.ts; hier alleen de aanroep.
 *
 * Tauri (Mac): meldingscentrum via tauri-plugin-notification. Android Device
 * Manager: NotificationManager via `__AXE_ANDROID__.notify`. De PWA houdt
 * web-push; de A17 gebruikt dat pad niet — 0 subscriptions, de telefoon
 * hoorde niets.
 *
 * Toestemming: macOS één keer per sessie; Android de systeemprompt op first
 * launch (Kotlin). Weigert het OS, dan blijft de bel werken.
 */
import { isAndroidShellRuntime, isTauriRuntime } from '@/infrastructure/config/apiUrl';
import type { SysteemMelding } from '@/domain/systeemMelding';
import { nativeNotify } from '@/infrastructure/gateways/androidNotifyBridge';

let gevraagd = false;

async function magMelden(plugin: typeof import('@tauri-apps/plugin-notification')): Promise<boolean> {
  if (await plugin.isPermissionGranted()) return true;
  if (gevraagd) return false;
  gevraagd = true;
  return (await plugin.requestPermission()) === 'granted';
}

/** Gooit nooit: een melding die niet lukt mag de bel niet meenemen. */
export function toonSysteemMeldingen(meldingen: readonly SysteemMelding[]): void {
  if (meldingen.length === 0) return;
  if (isAndroidShellRuntime()) {
    for (const m of meldingen) nativeNotify(m.title, m.body, m.id ?? m.title);
    return;
  }
  if (!isTauriRuntime()) return;
  void (async () => {
    const plugin = await import('@tauri-apps/plugin-notification');
    if (!(await magMelden(plugin))) return;
    for (const m of meldingen) plugin.sendNotification({ title: m.title, body: m.body || undefined });
  })().catch(() => {});
}
