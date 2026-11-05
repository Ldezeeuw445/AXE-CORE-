/**
 * HQ-look types (`domain/look.ts`): black | glass.
 * De overlay-notch volgt die standen niet meer (Luka 5 nov): vaste HQ-schil
 * `--axe-surface #0A0A0A`. `~/.axe/look` blijft van het HQ-main-venster.
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

/** HQ `--axe-card-bg` (src/design/axe-surface.css): kaarten zijn altijd matzwart, in elke look. */
export const AXE_CARD_BG =
  "linear-gradient(180deg, rgba(23, 23, 23, 0.94), rgba(12, 12, 12, 0.96))";

/** Bewaard voor tests / HQ-look-helpers. Overlay-chrome volgt data-look niet. */
export function applyLook(look: Look): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.look = look;
  document.documentElement.style.setProperty("--axe-card-bg", AXE_CARD_BG);
  // Geen color-scheme op <html>: WKWebView schildert anders een rechthoekige
  // backing (hoek-streepjes naast CSS-radius). Notch-chrome staat in App.css.
}
