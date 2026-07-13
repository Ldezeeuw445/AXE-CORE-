---
name: Runtime org tree vs nav registry scope
description: Why navRegistry.ts (chat/tab nav) and systemRegistryService's org tree (Runtime workspace) are intentionally separate lists, not one merged registry.
---

`axe-core-hq` has two node/label lists that look like duplicates but answer different questions:

- `src/lib/navRegistry.ts` (`NAV_ITEMS`) — the in-app tab bar & chat-navigation source of truth (used by BottomNav and chatActionService).
- `src/services/systemRegistryService.ts` (`loadAxeOrganization`, rendered by `RuntimeCanvas.tsx`) — the AXE ecosystem org tree, whose "Applications" branch includes sibling *products* like AXE Companion and AXE Intel that are separate external apps/repos, not tabs inside this HQ app.

**Why:** Merging them would force product-identity nodes (which have no route) to fake a tab, or force in-app-only tabs (Terminal, Cron Manager, etc.) to fake an org node. They're different concepts wearing similar-looking name lists.

**How to apply:** When a Runtime org node genuinely does correspond to an in-app tab (e.g. "Trading OS" -> `/trading`), add the Runtime label as a keyword alias on the matching `NavItem` instead of merging the data models. Don't collapse the two files into one registry.
