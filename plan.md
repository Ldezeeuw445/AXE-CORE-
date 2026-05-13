# AXE INTELLIGENCE TERMINAL — plan.md (UPDATED)

## 1) Objectives
- Maintain a working end-to-end pipeline already in place: **Sweep (8 adapters) → Normalize → Store → Correlate with Claude (Emergent Integrations) → Serve unified intel to UI**.
- Deliver Bloomberg/Palantir-grade **map interaction quality**:
  - **2D dark Leaflet only** (desktop + mobile). **Remove/disable 3D globe**.
  - **Custom symbol markers per category** + **FULL intel hover panel** (not compact tooltips).
  - Consistent styling with the existing **World Intelligence Map**.
- Mobile companion must feel premium and efficient:
  - **Single persistent 2D map** (never unmounts on tab switches).
  - **Collapsed AXE chat** becomes a **bottom type-bar above tabs** that expands into a drawer when tapped.
- Extend vessel coverage beyond Digitraffic (Baltic) with **global AISStream.io WebSocket** (user-provided key).
- Deliver a written **Bloomberg-grade data cost analysis** (`/app/COST_ANALYSIS.md`) for true paid-grade sources.
- Preserve reliability constraints:
  - **Do not remove the AI correlate caching mechanism** (background run during sweep + cached result to avoid timeouts).
  - Graceful degradation, health badges, cache-first rendering.

## 2) Implementation Steps

### Phase 1 — Core POC (Isolation: prove integrations + correlation) ✅ COMPLETED
**Goal:** Validate external dependencies + normalization + correlation before building the full UI.

Completed:
1. Verified free/no-auth endpoints across the 8 OSINT adapters.
2. Normalized outputs into unified event structures and persisted snapshots.
3. Implemented Claude correlation via `emergentintegrations` with **async execution + cache** to prevent `/api/ai/correlate` timeouts.

Exit gate status: **passed** (data flows end-to-end; correlation returns structured output).

---

### Phase 2 — V1 App Development (UI+API around proven core) ✅ LARGELY COMPLETED
**Goal:** Terminal works with real sweeps + correlation, premium UI.

Completed:
1. **Backend (FastAPI + MongoDB)**
   - 8 adapters implemented and wired into a sweep loop.
   - Events + signals persisted.
   - Correlation cached (critical reliability fix).
2. **Frontend (React + Tailwind)**
   - Dark glass morphism + cyan headers.
   - World Intelligence Map + news tickers + premium panels.
   - Spinner library (61).
3. **Registries**
   - Corporate jets registry matching.
   - High-impact vessel tracking + matching.
4. **Alerts subsystem**
   - Backend rule engine + UI (`AlertBell`, `AlertRulesModal`).

In-progress / newly requested refinements now supersede remaining V1 polish:
- Map marker detail + hover intel.
- Mobile chat redesign.
- Mobile persistent map layout.

---

### Phase 3 — Authentication + Operator Hardening ✅ COMPLETED (CURRENT STATE)
**Goal:** Maintain login gate and reliability.

Status:
- Auth exists and terminal is gated.
- No changes required for the 5-item batch beyond ensuring refactors don’t regress auth flows.

---

### Phase 4 — Refinement Batch (CURRENT SPRINT — implement ALL 5 items end-to-end)
This phase replaces the previously planned “post-v1” upgrades with the user-confirmed 5-item batch.

#### Phase 4A — Detailed Map Markers + FULL Intel Hover Panel (P0)
**Goal:** Bloomberg-grade map interaction: custom symbols by category and a full intel hover panel.

Steps:
1. **Define marker taxonomy & icon set**
   - Categories: `air/jets`, `vessel`, `heat/fire`, `space/satellite`, `news`, `cyber`, `macro`, `intel/other`.
   - Create a shared icon factory: `getMarkerIcon(category, severity, subtype)` returning **custom SVG** rendered as Leaflet `divIcon`.
   - Severity encoding: glow/intensity rings and outline color; keep within existing cyan/teal palette.

2. **Implement shared Marker component**
   - Build a reusable `IntelMarker` (or equivalent) that:
     - Renders category symbol + severity.
     - On hover: opens a **FULL Intel Hover Panel** (not a tiny tooltip).
     - On click: optionally “pin” the panel (so it persists until closed).

3. **FULL Hover Panel UI**
   - Glass morph panel anchored near cursor/marker.
   - Content layout:
     - Header: icon + title + source badge + timestamp + severity meter.
     - Body: normalized fields by category (e.g., aircraft callsign/altitude/speed/heading; vessel MMSI/IMO/speed/destination; fire radiative power; satellite NORAD ID; macro series values; cyber IOC summary).
     - Footer: external links + “Add to Watchlist / Create Alert Rule” shortcuts (if feasible without scope creep).

4. **Deep field mapping**
   - Ensure all adapters supply consistent `data` keys used by the panel.
   - Add a normalization helper if necessary so panel doesn’t branch excessively.

5. **Testing (frontend)**
   - Verify hover panel works on desktop (mouse hover).
   - Verify mobile behavior uses tap-to-open and a close control.
   - Confirm performance: marker clustering or throttling if event counts spike.

Deliverable:
- Desktop + mobile map shows rich symbols with full hover intel.

---

#### Phase 4B — Remove 3D Globe; unify all desktop maps to 2D dark Leaflet (P0)
**Goal:** Desktop maps must be **2D dark Leaflet only**, matching current World Intelligence Map styling.

Steps:
1. **Identify and remove/disable 3D globe toggle**
   - Remove `react-globe.gl` / Three.js usage from UI pathways.
   - Strip globe-specific state, controls, and any conditional rendering.

2. **Unify map configuration**
   - Create a single Leaflet configuration module (tile style, controls, attribution, zoom bounds).
   - Ensure all “desktop map views” share:
     - Same base tiles
     - Same overlays/layers
     - Same marker rendering pipeline from Phase 4A

3. **Ensure parity with World Intelligence Map**
   - Match spacing, glow, cyan accents, and glass overlay style.

Testing (frontend):
- Desktop terminal loads with no globe dependencies.
- Map renders and interaction remains smooth.

---

#### Phase 4C — Mobile: single persistent map + AXE chat bottom input bar above tabs (P0)
**Goal:** Mobile should feel like a companion: one always-on map, overlays on top, and a minimal chat entry point.

Steps:
1. **Refactor `MobileTerminal.jsx` to keep map mounted**
   - Render the Leaflet map as a persistent base layer.
   - Tabs switch **overlay panels/sheets** rather than conditionally mounting/unmounting the map.
   - Preserve map state (center, zoom, selected/pinned intel item).

2. **Refactor `AxeChatWidget.jsx` for mobile**
   - Replace floating pill with a **fixed bottom type-bar** placed **above bottom tabs**.
   - Tap/focus expands to a full-height (or partial) chat drawer.
   - Keep styling: black glass + cyan focus ring + premium transitions.
   - Ensure it does not block critical map controls.

3. **Mobile marker interactions**
   - Hover equivalent: tap marker opens the **full intel panel** as a bottom sheet or anchored overlay.

Testing (frontend):
- Verify map never remounts when switching tabs.
- Verify chat bar stays above tabs and expands/collapses correctly.

---

#### Phase 4D — AISStream.io global vessel WebSocket integration (P1, but included in this batch)
**Goal:** Bloomberg-grade **global** vessel coverage beyond Digitraffic.

Steps:
1. **Backend adapter implementation**
   - Update `/app/backend/adapters/vessel.py` (or add a new adapter module) to:
     - Connect to AISStream.io WebSocket using the user-provided API key.
     - Subscribe to global feed with server-side filters (message types, bounding boxes if needed).

2. **Ingestion pipeline**
   - Normalize AISStream messages into the existing `events` format.
   - Dedupe: keep latest per MMSI/IMO; drop excessive updates.
   - Store: write events into MongoDB and optionally maintain an in-memory cache for fast UI pulls.

3. **Registry enrichment**
   - Cross-reference “high-impact vessels” registry.
   - Raise severity when a tracked vessel appears, changes status, or enters watch regions.

4. **Operational safety**
   - Reconnect logic with backoff.
   - Rate limiting / sampling to avoid DB write storms.

Testing (backend/manual):
- Confirm WS connection stable.
- Confirm events appear in terminal and render as vessel markers with full hover intel.

---

#### Phase 4E — Bloomberg-grade Cost Analysis markdown deliverable (P1, included in this batch)
**Goal:** Provide an actionable roadmap for “true terminal-grade” data acquisition and likely costs.

Steps:
1. Create `/app/COST_ANALYSIS.md` including:
   - Market data terminals (Bloomberg, Refinitiv) high-level cost ranges.
   - ADS-B: enterprise-grade options and typical pricing factors.
   - AIS: exactEarth/Spire, ORBCOMM, etc. and what you gain vs free.
   - Satellite imagery: Planet Labs, Maxar, Sentinel (free) vs paid tiers.
   - Cyber intel: Mandiant, Recorded Future, VirusTotal Enterprise.
   - News/licensing: Dow Jones/Factiva, LexisNexis, FT, etc.
   - Compliance notes: redistribution/licensing restrictions.
   - Recommended staged upgrade path for AXE.

Deliverable:
- Committed markdown brief with clear sections, pricing ranges (where publicly known), and integration notes.

---

### Phase 5 — Intelligence Quality Upgrades (post-batch)
(Deferred until after the 5-item batch is shipped.)
- Better entity extraction and clustering.
- Signal templates per domain.
- Preset alert rules tied to new AISStream feed.

## 3) Next Actions
1. Implement **shared 2D Leaflet map foundation** + remove globe dependencies (Phase 4B).
2. Implement **custom marker icons + full hover intel panel** (Phase 4A).
3. Refactor **mobile persistent map** + **bottom chat bar** (Phase 4C).
4. Integrate **AISStream.io** global vessel feed using the provided API key (Phase 4D).
5. Write `/app/COST_ANALYSIS.md` (Phase 4E).
6. Run **frontend testing agent** for map + mobile UX and **backend testing agent** for AIS ingestion stability.

## 4) Success Criteria
- Map UX:
  - Desktop and mobile show **category-specific custom symbols**.
  - **Full intel panel appears directly on hover** (desktop) and on tap (mobile).
- Maps:
  - **All maps are 2D dark Leaflet**. No 3D globe present in UI or dependencies.
- Mobile:
  - One persistent map instance; tab changes do not remount the map.
  - AXE chat is a bottom type-bar above tabs; expands into a drawer on interaction.
- Global AIS:
  - AISStream.io feed ingests reliably with reconnection/backoff.
  - Global vessels render and enrich with high-impact registry.
- Cost analysis:
  - `/app/COST_ANALYSIS.md` exists and outlines realistic paid data paths and costs.
- Reliability:
  - Claude correlation caching remains intact; no regressions to timeout behavior.
  - No blank panels; clear stale/error badges remain consistent.