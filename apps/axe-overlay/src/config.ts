import { invoke } from "@tauri-apps/api/core";

/** Backend origin. Never bake API keys into the bundle. */
export const DEFAULT_API_ORIGIN = "https://api.axecompanion.com";

export type OverlayConfig = {
  apiKey?: string;
  apiOrigin?: string;
};

let cached: OverlayConfig | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/** Load optional local config from Rust (app data dir). Never log the key. */
export async function loadLocalConfig(): Promise<OverlayConfig> {
  if (cached) return cached;
  const envOrigin = (import.meta.env.VITE_AXE_API_ORIGIN as string | undefined)?.replace(/\/$/, "");
  if (!isTauri()) {
    cached = { apiOrigin: envOrigin || DEFAULT_API_ORIGIN };
    return cached;
  }
  try {
    const raw = await invoke<{ api_key?: string; api_origin?: string }>("get_overlay_config");
    cached = {
      apiKey: raw.api_key || undefined,
      apiOrigin: (raw.api_origin || envOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, ""),
    };
  } catch {
    cached = { apiOrigin: envOrigin || DEFAULT_API_ORIGIN };
  }
  return cached;
}

export function clearConfigCache(): void {
  cached = null;
}

export function authHeaders(apiKey?: string): Record<string, string> {
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}

export async function setLaunchAtLogin(enable: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_launch_at_login", { enable });
}

export async function getLaunchAtLogin(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("get_launch_at_login");
}

export async function resizeOverlay(expanded: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("resize_overlay", { expanded });
}
