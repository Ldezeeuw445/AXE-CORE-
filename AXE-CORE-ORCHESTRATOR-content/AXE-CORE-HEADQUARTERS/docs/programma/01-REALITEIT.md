# 01 — Ecosysteemkaart: wat er echt draait

Gemeten 14–15 oktober 2026. Elke regel komt uit code, een live aanroep of een
log, niet uit een plan. Wat niet gemeten kon worden staat er als **niet gemeten**.
De canon (wat het moet worden) staat in `canon/`; dit is wat het nu is.

## Machines

| machine | adres | wat er draait |
|---|---|---|
| VPS | 212.227.91.79 (`api.axecompanion.com`) | `axe-core-api` (2 uvicorn-workers), `axe-task-worker` (10 slots, missie-engine), `northsea-mcp` :8040 (1.4.1), AXE Companion (`axe-companion.service`, tak `deployed`, nginx), Ollama :11434, crontab → `/cron/tick` elke minuut |
| STRATO | 217.160.135.111 | 5 DAX-containers (developer, browser, northsea, thinktank, trading), verse heartbeats; `ollama.axecompanion.com` |
| iMac | Tailscale | computer-worker `imac-1` (enige verse heartbeat), autosync elke 5 min, Mac-executor (planner) |
| Mac mini | Tailscale | computer-worker-rijen **verlopen** (laatst 4 en 11 okt) |

## Supabase-projecten

| ref | naam | wie | staat |
|---|---|---|---|
| `pqnngpcgbdwxavbatbia` | AXE Companion | AXE Core, Companion, Trading OS — bewust één bron | gezond. `core_tasks`: 745 klaar, 168 mislukt, 405 geannuleerd, 75 wachtend, 21 wacht op goedkeuring, 1 geblokkeerd |
| `kbimnuepbecbyezedvih` | AXE Commodities | NorthSea | **database onbereikbaar sinds 11 okt 03:57 UTC** (incident) |
| `ktaditgtbubonrahyiig` | AXON | AXON Memory | **niet bereikbaar vanuit deze sessie** (ander Supabase-account) |

## Producten

### AXE Core — axeheadquarters.com (alleen Luka)

- Repo `Ldezeeuw445/AXE-CORE-`, tak `orchestrator`, werkmap `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS`.
- Web: Cloudflare Pages vanaf `orchestrator`. Desktop: Tauri (CI-build op macOS bij push). Backend: `backend/axe_api/main.py` op de VPS, uitrol via `scripts/vps_sync.py`.
- **Echt en in gebruik:** durable task kernel (leases, retries, goedkeuringen, events), missies, scheduler met lease en run-ledger (`core_schedules`/`core_job_runs`), DAX op STRATO, CLI-bruggen (Claude ×4, Codex ×3, Cursor) achter een repo-whitelist, PTY-terminal, Monaco met agent en diff-review, tier-router, roster.
- **Drie schedulers naast elkaar:** `core_schedules` (8 rijen), pg_cron (17 jobs), `axe_ops.cron_job` (van Companion, SQL in geen enkele repo). De Control Plane voegt ze samen in één weergave.
- **Gaten:** product-identiteit staat op 8+ plekken; geen build/test/deploy/health/runbook per product; `/health` is statisch; meldingen op de A17 gaan via Device Manager (WorkManager), niet via 0 web-push-abonnementen; `/internal/exec` is een onbeperkte root-shell; `public.app_secrets` is platte tekst, de Vault-keystore `axe_ops.app_secret` is leeg; actiontype `dax` draait op de box maar staat niet in git; het `vps_sync.py`-manifest mist ~11 modules die `main.py` importeert.
- CI: alleen de Tauri-build. Geen typecheck, test of lint in CI.

### AXE Code — onderdeel van AXE Core

- **Echt:** Monaco-editor (`CodeEditorPage.tsx`), bestands-API met repo-scope, PTY-terminal, CLI-bruggen, `/claude/commit` (whitelist, nooit main/master), PreviewPanel met DOM-brug voor ontwerpmodus.
- **Half:** git-paneel draait in de werkmap van de API in plaats van de gekozen repo; preview is één globale poort in een 2-worker-proces (status kan op de andere worker landen); ontwerpmodus is niet AST-gebaseerd; Supabase-modus alleen rij-CRUD op het gedeelde project.
- **Ontbreekt:** projectsysteem (aanmaken, importeren, recent), contextindex (alleen grep), echte git-worktrees per agent, visuele QA-lus, deploy-adapters als één abstractie.

### AXE Companion — axecompanion.com (mobiel eerst)

- Repo `Ldezeeuw445/AXE-COMPANION-OS-`. Next 16 / React 19. Productie op de VPS achter nginx (niet Vercel), uitrol `scripts/deploy-vps.sh` naar tak `deployed`. Actieve integratietak: `claude/axe-companion-audit-launch-nz58dg` (85 commits voor op main; een andere sessie werkt erop).
- **Echt:** MT5/MetaAPI (koppelen, sync, live chart, bewaakte orderroute), chart-live via Cloudflare-worker `axe-chart-edge` (WS/poll, SSE-terugval), journaling met leerlus (`axe_memory`, weak spots), proactieve watcher met accountprofielen (live/demo/prop), feed-renderer, tier-gates op alle 84 routes, `npm run verify` (16 guards), uptime-watch met ntfy.
- **Open (eigen bouwlijst):** veiligheidsniveaus voor zelfstandig handelen (6.x), alerts die handelen (7.x), onboarding tier → eigen MT5 (10.x), 182 anonieme accounts, 54× `founder` tegen 1 Stripe-abonnement, Supabase-schakelaar anonieme login.
- **Niet gemeten in deze ronde:** de Companion-brede audit (agent liep op de sessielimiet). Wat hier staat komt uit `AXE_SYSTEM_TRUTH.md` en `docs/BOUWLIJST-COMPANION-LAUNCH.md`.

### Trading OS — tradingosapp.com (web/PWA)

- Echte broncode in `Ldezeeuw445/the-one`, map `Desktop/Trading OS Final APP/TRADING OS FINAL UI AND MAIN/` (standaardtak `feature/ibkr-alpaca-adapters`). `Ldezeeuw445/trading-os-` is **leeg**.
- **Domein geeft HTTP 402 DEPLOYMENT_DISABLED** (Vercel). `vercel.json` bouwt bovendien de AXE-variant.
- Vite 7 + React 19, 5 edge functions op het **gedeelde** project, Cloudflare `trading-os-live-engine` (één globale Polygon-forex-WS-room).
- **Echt:** chart-historie (Polygon → TwelveData → FMP via engine-proxy), FRED, FMP-nieuws/earnings, OpenSky, AISStream, alleen-lezen MetaAPI-sync naar `broker_trades` (handmatige knop), journal en notities.
- **Nep:** vaste $100.000 vermogen en BREAKING-koppen, ticker, willekeurig orderboek, willekeurige terugval-koersen/candles/macro **met het label live**.
- **Hangt af van een externe Python-FastAPI die nergens draait** (`VITE_TRADING_TERMINAL_API_URL`): indicatoren/SMC, tekeningen, alerts, AI-desk, uitvoering, kalender, multi-chart zijn zonder die dienst no-ops.
- **Ontbreekt:** indicator-engine, opslag van tekeningen, alerts, risk-engine, instrumentregister, tests, CI, prijsafdwinging, AXON, uitvoeringsrechten.
- **Beveiliging (zie 03):** engine-proxy zonder JWT en met CORS `*`; WS `/ws` zonder auth; RLS laat gebruikers eigen `accounts`/`positions`/`broker_trades` schrijven; `VITE_*`-providersleutels lekken als `VITE_USE_ENGINE_EDGE` niet `'true'` is; uitvoering zonder bevestiging; `public/hero-bg.png` is 39,7 MB; `supabase/.temp` staat in git.

### AXON Memory — axon-memory.com / app.axon-memory.com

- **Productie draait een verouderde fork**: bundle `index-BTHXUNnC.js` uit `Ldezeeuw445/axon-memory` (root `src/`), niet uit `axon-memory-app` main. Beide domeinen tonen dezelfde oude bundle. Uitrol was handmatig (wrangler direct upload).
- CI is in beide repo's dood. Canon staat in `Docs/axon/` van `axon-memory-app`.
- **Model:** `memory_items` + `memory_embeddings` (vector(1536), HNSW, gemini-embedding-001) + `memory_facts` (door een LLM gedestilleerd, herkomst per batch).
- **Canondrift:** geen Thread/Weight/Depth/Facet/Core in het schema; Thread betekent nu een cursorregel; verboden UI-woorden; plan heet Ultra in plaats van Power; "Most chosen" en "Limited founder pricing".
- **Recall:** één modus, zonder bron-id's. `memory-core.ts:146` selecteert een niet-bestaande `memory_items.updated_at`, waardoor notities vermoedelijk nooit in het pakket komen.
- **MCP:** Streamable HTTP + OAuth, 14 tools; geen retire/delete/update/export. `mcp.axon-memory.com` geeft 405 op GET (verwacht voor POST-only).
- **Beveiliging:** RLS `api_keys_all_own` laat een gebruiker zelf een `key_hash` invoegen (omzeilt plancontrole); OAuth met open registratie, `client_name` uit de query op het toestemmingsscherm, tokens zonder verloop, PKCE `plain` toegestaan, scopes niet afgedwongen; privacypagina klopt niet over Gemini; verwijderen laat feiten, opslag, Stripe en tokens staan.
- `/docs` belooft een `/v1`-API en SDK's die niet bestaan; home toont een nep "Neural Link/Active Thread"; `assetlinks.json` ontbreekt (TWA niet geverifieerd).
- AXE Core gebruikt AXON alleen schrijvend (`axonMemoryService.ts` → `/remember`, vanuit trading-intel).

### NorthSea — northseacommodity.com / Global Trade Center

- Code in AXE Core: UI `StandaloneNorthseaPage.tsx` + `pages/northsea/*`, backend `backend/axe_api/northsea*.py`, MCP/engine `backend/northsea_mcp/` (1.4.1 op :8040, OAuth), Supabase `supabase/northsea/*`. `northsea-commodity` en `northsea-crewai` zijn lege stubs.
- **Buitenkant beveiligd (live bewezen 14 okt):** VPS `/northsea/*` 401 zonder of met verkeerde sleutel; `axe-core-proxy` 401 op vervalste JWT; MCP `POST /mcp` 401 met WWW-Authenticate; `northsea-command-center` 401; `northsea-desk`, `commodity-intake`, `resend-lifecycle`, `resend-reconcile-outbound` 405 op GET, POST vereist handtekening of service-sleutel; OpenAPI-root alleen service_role.
- **RLS op AXE Commodities niet live bewezen**: elke tabel gaf 522.
- **Incident:** database staat stil sinds 11 okt 03:57 UTC; oorzaak is de niet-uitgerolde fix van 6 okt (`incidenten/2026-10-11-northsea-db.md`).
- Autonomievlaggen in `deal_automation_policy` staan uit; de crew_loop heeft een eigen uitvoeringspad (zie `HERSTEL_20261006.md`).
- Open: CrewAI-booleannormalisator, inbound/outbound mail eind-tot-eind, hygiëne verlopen tender RFT 367144 (gesloten 9 okt 2026), twee niet-gemergde takken (`cursor/desk-run-skip-parked-marketplace-7b5c`, `cursor/northsea-discovery-quality-06db`).

## Domeinen (14 okt)

| domein | status |
|---|---|
| axeheadquarters.com | 200 (Cloudflare Pages) |
| api.axecompanion.com/health | 200 |
| axecompanion.com | 200 (nginx op de VPS) |
| tradingosapp.com | **402** DEPLOYMENT_DISABLED |
| axon-memory.com, app.axon-memory.com | 200, verouderde bundle |
| mcp.axon-memory.com | 405 op GET |
| northseacommodity.com | 200 |
| mcp.northseacommodity.com/health | 200, versie 1.4.1 |
