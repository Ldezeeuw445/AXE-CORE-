---
name: Responsive breakpoints — mobile vs tablet
description: Why an app can look fine on phone and desktop but broken specifically on iPad/tablet widths, and the fix pattern.
---

A layout that has a `useIsMobile()` check (e.g. `<768px`) and otherwise falls back to the desktop layout can look correct on phones and on real desktops, yet break specifically in the 768–1024px tablet range — because that range gets the "desktop" fixed-width chrome (sidebar + right panel as permanent columns) squeezed into a much narrower viewport than actual desktop.

**Why:** Multiple fixed-width asides (e.g. a 240px left sidebar + a 280–320px right panel) each render unconditionally once `isMobile` is false, with no separate tablet-width handling — on a 768–810px-wide iPad portrait viewport those alone can consume most of the screen, leaving almost no room for main content.

**How to apply:** When "make it work on iPad" is reported as broken while phone works, check whether there's a dedicated tablet-range hook/breakpoint (e.g. `useIsTablet()` for 768–1024px) and whether every fixed-width chrome component (sidebars, right panels, toggle buttons) treats that range the same as mobile (overlay drawer, not permanent column) — not just true desktop (>1024px). Fix by combining `isMobile || isTablet` into one "compact" condition at each such component; leave the true-desktop branch untouched to avoid regressing the desktop experience.
