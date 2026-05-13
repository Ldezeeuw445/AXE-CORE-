# AXE Intelligence Terminal — PRD (updated Phase 3)

## What was built
A Bloomberg-grade single-screen intelligence terminal that fuses 8 live OSINT/macro layers and uses Claude Sonnet 4.5 as a correlation + chat brain (AXE Intelligence). Now with **trading-intel focused corporate jet + vessel tracking** and a **full mobile companion view**.

## Stack
- **Backend**: FastAPI + Motor/MongoDB + httpx, async adapter pattern + sweep loop + cache
- **Frontend**: React + Tailwind + shadcn + Leaflet (2D) + react-globe.gl (3D) + Lucide icons + Inter font
- **AI**: Claude Sonnet 4.5 via emergentintegrations + EMERGENT_LLM_KEY

## Data adapters
| Layer | Source | Trading-intel focus |
|---|---|---|
| news | GDELT DOC 2.0 | – |
| **air** | **adsb.lol /v2/pia + /v2/ladd + /v2/mil + per-registration** | **Curated registry of 87 corporate jets (US-first then EU): Tech, Finance, Industrial, Retail, Energy, Pharma, Media, Defense, Luxury, Auto, Banking…** |
| **vessel** | **DigiTraffic + curated registry** | **59 high-impact vessels: ULCV container (MSC IRINA, EVER GIVEN, MSC GÜLSÜN…), VLCC tankers, LNG carriers, cruise ships (ICON OF THE SEAS, DISNEY WISH), mega yachts (DILBAR, AZZAM, ECLIPSE, KOR, SERENE, RISING SUN)** |
| space | wheretheiss.at + tle.ivanstanojevic.me | – |
| macro | World Bank + Frankfurter | – |
| crypto | CoinGecko | – |
| heatmap | NIFC public ArcGIS VIIRS | – |
| intel | USGS + CISA KEV | – |

## Routes
**Auth**: `POST /api/auth/login`, `GET /api/auth/me`
**Sources**: `POST /api/sources/sweep`, `GET /api/sources/latest`, `GET /api/adapters/{name}`
**AI**: `POST /api/ai/correlate`, `GET /api/ai/correlate/latest`, `POST /api/ai/chat`
**Watchlists**: `GET/POST/PUT/DELETE /api/watchlists[/id]` (Phase 3)
**History**: `GET /api/history/correlations`, `GET /api/history/sweeps`, `GET /api/history/correlation/{sweep_id}` (Phase 3)
**System**: `GET /api/health`, `GET /api/meta`

## UI
**Desktop (≥1024px)**
- Top bar: triangle logo, headline-risk badge, sweep timer, sources X/Y, alert badge, REPLAY (history), SPINNERS (showcase)
- Ticker (crypto + FX), 3-column layout (sensor grid / center / cross-source signals)
- Center: 2D Leaflet map + 3D Globe toggle, region tabs, **Corporate Jet Movements + Vessel Trading Intel** side-by-side, Macro+Markets, Leverageable Ideas, Live News
- Right: Cross-Source Signals, OSINT Stream, Signal Core hot metrics, Sweep Delta
- Floating draggable AXE chat widget (minimize to triangle pill)
- 61-style Agent Spinners library at `/spinners` (categories + search)
- Signal History modal: paginated correlation replay

**Mobile (<1024px)**
- Premium mobile companion view with 7-tab floating dock (Overview / Map / Jets / Vessels / Markets / Signals / News)
- Tab content adapted: dense sensor grid in 4×2, scrollable lists, full-screen map
- AXE chat as bottom drawer
- Same triangle identity, same cyan headers, same Inter typography

## Credentials
- Email: `operator@axe.intel`
- Password: `axe2026`

## File map (additions in Phase 3 bolded)
```
backend/
├── server.py                              # FastAPI app + lifespan + sweep loop
├── routes/{auth,sources,ai,system}.py
├── routes/watchlists.py                   # NEW (Phase 3)
├── routes/history.py                       # NEW (Phase 3)
├── services/{sweep,ai,cache,http}.py
├── adapters/{news,air,vessel,space,macro,crypto,heatmap,intel}.py
├── data/__init__.py                        # NEW: corporate jets registry (87)
└── data/vessels_registry.py                # NEW: high-impact vessel registry (59)

frontend/src/
├── App.js + contexts/AuthContext.js + lib/api.js
├── pages/{Login,Terminal}.jsx
├── pages/MobileTerminal.jsx                # NEW: mobile companion view
├── pages/Spinners.jsx                       # NEW: 61-style showcase
└── components/
    ├── axe/{TriangleLogo,Panel,AxeChatWidget}.jsx
    ├── axe/Spinner.jsx                      # 61 variants (expanded)
    └── terminal/{TopBar,LeftSidebar,RightSidebar,CenterPane,WorldMap2D,WorldGlobe3D,
                    MacroMarkets,LeverageableIdeas,LiveNewsList,NewsTicker,
                    CorporateJets,HighImpactVessels,SignalHistoryModal}.jsx
                    # CorporateJets/HighImpactVessels/SignalHistoryModal = NEW
```
