/**
 * Zes tabs in het notch-sidepanel (Luka 30-10 17:16: "AXE als een soort OS").
 * Pure logica, zonder Tauri/React, zodat het los te testen is.
 */
export type NotchTab = "home" | "chat" | "meldingen" | "agents" | "northsea" | "trading";

/** Routes die de notch rechtstreeks in de HQ-shell mag openen (allowlist). */
export type ShellRoute = "/northsea" | "/trading";

export const NOTCH_TABS: readonly { id: NotchTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "meldingen", label: "Meldingen", icon: "🔔" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "northsea", label: "NorthSea", icon: "🌊" },
  { id: "trading", label: "Trading", icon: "📈" },
];

export type TabActie =
  | { soort: "open-shell"; route?: ShellRoute }
  | { soort: "kies-tab"; tab: NotchTab };

/**
 * Home / NorthSea / Trading openen de HQ-shell (eventueel op een vaste route).
 * Chat / Meldingen / Agents blijven in het notch-paneel.
 */
export function tabActie(tab: NotchTab): TabActie {
  if (tab === "home") return { soort: "open-shell" };
  if (tab === "northsea") return { soort: "open-shell", route: "/northsea" };
  if (tab === "trading") return { soort: "open-shell", route: "/trading" };
  return { soort: "kies-tab", tab };
}

/** Badge-telling per tab (alleen Meldingen en Agents hebben live data). */
export function tabBadge(tab: NotchTab, counts: { approvals: number; tasks: number }): number {
  if (tab === "meldingen") return counts.approvals;
  if (tab === "agents") return counts.tasks;
  return 0;
}
