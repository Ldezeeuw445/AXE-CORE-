/**
 * Zes tabs in het notch-sidepanel (Luka 30-10 17:16: "AXE als een soort OS").
 * Pure logica, zonder Tauri/React, zodat het los te testen is.
 */
export type NotchTab = "home" | "chat" | "meldingen" | "agents" | "northsea" | "trading";

export const NOTCH_TABS: readonly { id: NotchTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "meldingen", label: "Meldingen", icon: "🔔" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "northsea", label: "NorthSea", icon: "🌊" },
  { id: "trading", label: "Trading", icon: "📈" },
];

export type TabActie =
  | { soort: "open-shell" }
  | { soort: "kies-tab"; tab: NotchTab };

/** Home opent altijd de HQ-shell; andere tabs wisselen de actieve tab in het paneel. */
export function tabActie(tab: NotchTab): TabActie {
  if (tab === "home") return { soort: "open-shell" };
  return { soort: "kies-tab", tab };
}

/** Badge-telling per tab (alleen Meldingen en Agents hebben live data). */
export function tabBadge(tab: NotchTab, counts: { approvals: number; tasks: number }): number {
  if (tab === "meldingen") return counts.approvals;
  if (tab === "agents") return counts.tasks;
  return 0;
}
