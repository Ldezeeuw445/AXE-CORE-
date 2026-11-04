/**
 * Collapsed topbar-knoppen wanneer HQ dicht/geminimaliseerd is.
 * Pure logica, los van React/Tauri.
 */
export type TopbarId =
  | "hq"
  | "chat"
  | "ptt"
  | "approvals"
  | "agents"
  | "settings";

export type TopbarActie =
  | { soort: "open-hq" }
  | { soort: "new-chat" }
  | { soort: "ptt" }
  | { soort: "approvals" }
  | { soort: "agents" }
  | { soort: "settings" };

export const TOPBAR_BUTTONS: readonly {
  id: TopbarId;
  label: string;
  icon: string;
  title: string;
}[] = [
  { id: "hq", label: "HQ", icon: "⌂", title: "Open AXE Core HQ" },
  { id: "chat", label: "Chat", icon: "+", title: "Nieuwe chat" },
  { id: "ptt", label: "PTT", icon: "🎙", title: "Push-to-talk" },
  { id: "approvals", label: "OK", icon: "✓", title: "Goedkeuringen" },
  { id: "agents", label: "Agents", icon: "◉", title: "Agents-status" },
  { id: "settings", label: "Set", icon: "⚙", title: "Instellingen" },
];

export function topbarActie(id: TopbarId): TopbarActie {
  switch (id) {
    case "hq":
      return { soort: "open-hq" };
    case "chat":
      return { soort: "new-chat" };
    case "ptt":
      return { soort: "ptt" };
    case "approvals":
      return { soort: "approvals" };
    case "agents":
      return { soort: "agents" };
    case "settings":
      return { soort: "settings" };
  }
}

/** Badge alleen op approvals (en optioneel agents via tasks). */
export function topbarBadge(
  id: TopbarId,
  counts: { approvals: number; tasks: number },
): number {
  if (id === "approvals") return counts.approvals;
  if (id === "agents") return counts.tasks;
  return 0;
}

/** Collapsed bar-hoogte in logical px — matte balk, flush onder menu bar. */
export const TOPBAR_HEIGHT = 44;
