# 03 — Gapmatrix per product en fase

`bestaat` = werkt en is bewezen · `half` = er is iets, niet volgens canon of niet
compleet · `stuk` = bestaat maar faalt of is onveilig · `ontbreekt` = er is niets.
Fasenamen zijn die uit `canon/`. Bewijs staat in `01-REALITEIT.md`.

## AXE Core (fundament)

| onderdeel | staat | toelichting |
|---|---|---|
| Taakkernel | bestaat | leases, retries, goedkeuringen, events; claimt wel elke taak ongeacht capability |
| Missies | bestaat | nog niet vanuit chat aan te maken |
| Scheduler | half | drie schedulers; Control Plane voegt samen |
| Productregister | half | `registered_apps` (4 rijen, Axon wijst naar de landingsrepo, geen NorthSea, geen commando's/health) |
| Heartbeat per product | half | sinds 15 okt zes productcomponenten in de servicebewaker (`docs/SERVICE-MONITORING.md`), live gemeten vanuit de cloud; nog niet bewezen op de Mac mini, `northsea_db` vraagt twee sleutelnamen in `.env.local` |
| Meldingen naar Luka | stuk | bewaker schrijft `core_notifications` en een macOS-melding; 0 push-abonnementen, dus de telefoon hoort niets |
| Geheimen op naam | half | inventaris in Control Plane; Vault-keystore leeg; platte tabel `app_secrets` |
| Uitrolbewijs | half | `vps_sync.py` voor de API; manifest mist ~11 modules; geen bewijs voor northsea-mcp |
| CI | half | alleen Tauri-build |

## AXE Code (X0–X12)

| fase | staat | toelichting |
|---|---|---|
| X0 inventaris | bestaat | dit document + auditrapport |
| X1 productgrens | ontbreekt | AXE Code is nu een pagina van AXE Core, geen afgebakend product |
| X2 projectsysteem | ontbreekt | alleen `AGENT_REPOS`-namen; geen import/clone/recent |
| X3 contextindex | ontbreekt | alleen substring-grep |
| X4 agent-taakkernel | half | kernel bestaat; geen echte worktrees per agent |
| X5 IDE | bestaat | Monaco, tabs, diff accept/reject |
| X6 run/preview | half | één globale poort, state per worker-proces |
| X7 visuele QA | ontbreekt | browser-agent en DAX-browser niet aan de preview gekoppeld |
| X8 ontwerpmodus | half | DOM-brug, niet AST-gebaseerd |
| X9 Supabase-modus | half | rij-CRUD op één project; geen schema/RLS/migraties |
| X10 BYOK/router | bestaat (chat) | geen geheim-op-naam per product |
| X11 deploy | half | losse scripts per doel, geen adapterlaag |
| X12 benchmark | ontbreekt | |
| Sandboxing | stuk | `/internal/exec` is een onbeperkte root-shell |

## AXE Companion (C0–C10)

| fase | staat | toelichting |
|---|---|---|
| C0 audit | half | uit eigen docs; volledige audit niet gelopen |
| C1 dubbele tradinglogica weg | ontbreekt | wacht op Trading Platform Core |
| C2 mobiele shell | bestaat | |
| C3 chart-pariteit | half | eigen chart-live; geen gedeelde chart-staat met Trading OS |
| C4 account/risk/journal | bestaat | accountprofielen, journaling-lus, weak spots |
| C5 AXE | bestaat | chat, context, geheugen in eigen services |
| C6 push | half | watcher bestaat; aflevering niet eind-tot-eind bewezen |
| C7 voice | niet gemeten | |
| C8 leerlus + AXON | half | leerlus in eigen tabellen; geen AXON |
| C9 PWA/native | half | |
| C10 release | half | anonieme accounts, `founder`-standaard, Stripe één abonnement |

## Trading OS (T0–T10)

| fase | staat | toelichting |
|---|---|---|
| T0 audit | bestaat | deze ronde |
| T1 Trading Platform Core | ontbreekt | logica dubbel met Companion |
| T2 marktdata-router | half | Polygon → TwelveData → FMP via engine-proxy; terugval is willekeurig en heet live |
| T3 broker/MT5 | half | alleen-lezen sync, handmatige knop |
| T4 chart-core | half | historie echt; tekeningen niet opgeslagen |
| T5 indicatoren | stuk | afhankelijk van ontbrekende Python-dienst |
| T6 risk/journal/alerts | half | journal echt; risk en alerts ontbreken |
| T7 AXE-context | stuk | AI-desk afhankelijk van ontbrekende dienst |
| T8 intelligence | half | FRED/FMP/OpenSky/AIS echt; koppen en vermogen nep |
| T9 pariteit met Companion | ontbreekt | |
| T10 billing/hardening/release | stuk | domein 402, geen tests/CI, beveiligingsgaten |

## AXON Memory (A0–A12)

| fase | staat | toelichting |
|---|---|---|
| A0 canon + audit | bestaat | deze ronde; productie draait een oude fork |
| A1 domeinmodel | half | items/embeddings/facts; geen Thread/Weight/Depth/Facet/Core |
| A2 capture | bestaat | |
| A3 recall | stuk | één modus, geen bron-id's, notities vallen weg door kolomfout |
| A4 tegenspraak/retire/delete | ontbreekt | |
| A5 RLS/tenant | stuk | `api_keys` zelf in te voegen |
| A6 MCP | half | 14 tools; OAuth zwak; geen retire/delete/update/export |
| A7 API/SDK | ontbreekt | `/docs` belooft het wel |
| A8 connectors | half | AXE Core schrijft alleen |
| A9 mobiele product | half | nep-elementen op home |
| A10 landing | half | verboden woorden, verkeerde plannaam |
| A11 billing | half | |
| A12 release | stuk | productie is de verkeerde codebase; CI dood |

## NorthSea (N0–N16)

| fase | staat | toelichting |
|---|---|---|
| N0 waarheid | half | buitenkant bewezen; DB-incident; RLS niet live bewezen |
| N1 eventbus + normalisator | half | engine-regels bestaan; CrewAI-normalisator niet gemeten |
| N2 Desk Manager | half | bestaat; crew_loop heeft een eigen uitvoeringspad |
| N3 specialistencrews | half | deterministische specialisten; Studio-LLM-crews niet bewezen |
| N4 discovery die blijft | stuk | slates in `action_queue.metadata`, niet in `sourcing_candidates` |
| N5 dealstatus | bestaat | engine-evaluatie met blokkades |
| N6 communicatie | half | goedkeuring, idempotent versturen, contactbeleid; eind-tot-eind niet bewezen |
| N7 opvolging | half | |
| N8 goedkeuringscentrum | half | `core_approvals` bestaat |
| N9 meldingen aan eigenaar | stuk | 0 abonnementen |
| N10–N12 bescherming, transactie, commissie | half | commissie-eis bij gevoelige acties bestaat |
| N13 zelfherstel | stuk | incident van drie dagen zonder melding |
| N14 commerciële prioriteit | ontbreekt | |
| N15 één echte deal | ontbreekt | |
| N16 24/7 | stuk | de lus zelf legde de DB plat |
