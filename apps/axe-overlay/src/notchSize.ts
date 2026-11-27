/**
 * Notch v2 sizes (Luka 27-11): the notch unfolds into a compact strip by
 * default. The large panel only opens when Luka asks for it (expand button,
 * ⌘E, or `expand-large` in ~/.axe/overlay.cmd). The last choice is remembered.
 * Pure logic, no React/Tauri, so it can be tested on its own.
 */
export type NotchSize = "compact" | "large";

/** localStorage key for the remembered open size. */
export const SIZE_KEY = "axe.notch.size";

/** Default open size: always the compact strip. */
export const DEFAULT_SIZE: NotchSize = "compact";

/** Compact strip height in logical px. Must match Rust COMPACT_H in lib.rs. */
export const COMPACT_HEIGHT = 216;

type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function isNotchSize(v: unknown): v is NotchSize {
  return v === "compact" || v === "large";
}

export function loadSize(store: KV | null | undefined): NotchSize {
  try {
    const v = store?.getItem(SIZE_KEY);
    return isNotchSize(v) ? v : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

export function saveSize(store: KV | null | undefined, size: NotchSize): void {
  try {
    store?.setItem(SIZE_KEY, size);
  } catch {
    /* private mode / no storage: just don't remember */
  }
}

export function toggleSize(size: NotchSize): NotchSize {
  return size === "compact" ? "large" : "compact";
}

/**
 * Keyboard inside the notch: ⌘E / Ctrl+E toggles compact ↔ large.
 * Esc steps down: large → compact → closed. Returns null when not ours.
 */
export type SizeKeyAction = "toggle" | "step-down" | null;

export function sizeKeyAction(e: { key: string; metaKey?: boolean; ctrlKey?: boolean }): SizeKeyAction {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") return "toggle";
  if (e.key === "Escape") return "step-down";
  return null;
}

/** overlay.cmd commands that pick a size explicitly (Hammerspoon / axe-keys). */
export function sizeFromCmd(cmd: string, remembered: NotchSize): NotchSize | null {
  if (cmd === "expand-large") return "large";
  if (cmd === "expand-compact") return "compact";
  if (cmd === "toggle-size") return toggleSize(remembered);
  if (cmd === "expand") return remembered;
  return null;
}
