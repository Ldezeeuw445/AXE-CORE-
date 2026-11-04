/**
 * Zelfde twee HQ-standen als AXE CORE (`domain/look.ts`): black | glass.
 * Overlay deelt ze via `~/.axe/look` (HQ schrijft bij wissel; overlay leest).
 */
export type Look = "black" | "glass";

export const LOOKS: readonly Look[] = ["black", "glass"] as const;

/** Zelfde default als HQ. */
export const DEFAULT_LOOK: Look = "glass";

export function isLook(value: unknown): value is Look {
  return typeof value === "string" && (LOOKS as readonly string[]).includes(value);
}

export function resolveLook(sources: { shared?: unknown; local?: unknown }): Look {
  if (isLook(sources.shared)) return sources.shared;
  if (isLook(sources.local)) return sources.local;
  return DEFAULT_LOOK;
}

/** Pas `data-look` toe waar App.css op aanslaat. */
export function applyLook(look: Look): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.look = look;
  document.documentElement.style.colorScheme = look === "glass" ? "light" : "dark";
}
