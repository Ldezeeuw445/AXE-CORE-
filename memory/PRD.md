# AXE Intelligence Terminal — PRD

## What was built (v1, Phase 2 complete)
A Bloomberg-grade single-screen intelligence terminal that fuses 8 live OSINT/macro layers and uses Claude Sonnet 4.5 as a correlation + chat brain (AXE Intelligence).

## Stack
- **Backend**: FastAPI + Motor + MongoDB, async adapter pattern + sweep loop + cache
- **Frontend**: React + Tailwind + shadcn + Leaflet (2D) + react-globe.gl (3D) + Lucide icons + Inter font
- **AI**: Claude Sonnet 4.5 via `emergentintegrations` + `EMERGENT_LLM_KEY`

## Data adapters (all free / no-auth)
| Layer | Source |
|---|---|
| news | GDELT DOC 2.0 |
| air | adsb.lol (live ADS-B) |
| vessel | Finnish Digitraffic AIS (Baltic Sea, dense) |
| space | wheretheiss.at (ISS) + tle.ivanstanojevic.me (TLE search) |
| macro | World Bank API (unemployment, CPI, GDP) + Frankfurter (FX) |
| crypto | CoinGecko public API |
| heatmap | NIFC public ArcGIS (VIIRS thermal hotspots) |
| intel | USGS earthquakes + CISA Known Exploited Vulnerabilities |

## Key API endpoints (all under `/api`)
- `POST /api/auth/login` (operator@axe.intel / axe2026 — seeded on startup)
- `GET /api/auth/me`
- `POST /api/sources/sweep` — trigger fresh multi-adapter sweep
- `GET /api/sources/latest` — last cached sweep snapshot
- `GET /api/adapters/{name}` — single adapter result
- `POST /api/ai/correlate` — Claude cross-source signals + leverageable ideas (cached, <1s after warmup)
- `GET /api/ai/correlate/latest`
- `POST /api/ai/chat` — operator chat with Claude (~7s)
- `GET /api/meta` — system meta

## Reliability strategy
- Per-adapter timeouts + in-memory cache with TTL
- On adapter error, fall back to last-good cache and mark **stale**
- Background sweep loop refreshes every 30s
- Background auto-correlation every 90s keeps the AI cache warm
- Frontend always renders from last snapshot — UI never goes blank

## UI
- Top bar: triangle logo, headline risk badge, sweep timer, sources X/Y, alert level
- News/macro ticker
- Left sidebar: Sensor Grid, Nuclear Watch, Risk Gauges, Space Watch
- Center: 2D Leaflet dark map + 3D Globe toggle + region tabs, Macro+Markets, Leverageable Ideas, Live News
- Right sidebar: Cross-Source Signals, OSINT Stream, Signal Core hot metrics, Sweep Delta
- Draggable, minimizable **AXE Chat** widget with triangle identity
- Premium ASCII/Braille spinners throughout
- Cyan headers, black-on-black glass morphism, Inter font, Lucide icons (no emojis)

## Credentials (seeded automatically)
- Email: `operator@axe.intel`
- Password: `axe2026`
- Configurable via env vars `OPERATOR_EMAIL` / `OPERATOR_PASSWORD`

## File map
```
backend/
├── server.py                  # FastAPI app + lifespan + sweep loop
├── routes/{auth,sources,ai,system}.py
├── services/{sweep,ai,cache,http}.py
├── adapters/{news,air,vessel,space,macro,crypto,heatmap,intel}.py
└── poc_axe.py                 # Phase 1 POC validation script

frontend/src/
├── App.js + contexts/AuthContext.js + lib/api.js
├── pages/{Login,Terminal}.jsx
└── components/
    ├── axe/{TriangleLogo,Spinner,Panel,AxeChatWidget}.jsx
    └── terminal/{TopBar,LeftSidebar,RightSidebar,CenterPane,WorldMap2D,WorldGlobe3D,MacroMarkets,LeverageableIdeas,LiveNewsList,NewsTicker}.jsx
```

## Known caveats
- GDELT (news) and CoinGecko (crypto) public endpoints rate-limit aggressively. The system handles this gracefully — failed adapters serve cached values with a `stale` badge. After ~60s any rate-limited adapter recovers.
- Vessel data is currently Baltic-Sea focused (Finnish Digitraffic). Future phases can add additional regional AIS feeds.
- 3D globe uses Three.js — heavy first paint (~2s after toggle), then smooth.
