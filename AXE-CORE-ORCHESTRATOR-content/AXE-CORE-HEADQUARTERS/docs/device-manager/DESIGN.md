# Device Manager — telefoonontwerp

Status: **ontwerp only**, behalve unlock (item 1): swipe → Home, keypad-code
blijft maar staat standaard uit. Geen productcode voor de apps hieronder.

De native A17-lockscreen is **final**. Phone Home (`/mobile` + `TelefoonSphere`)
is **final**. Geen orders, geen sends, geen transfers.

Doel: Luka kan vanaf de Samsung A17 (384×832 CSS-px, `com.axecore.core`
WebView) alles doen wat hij op de Tauri-desktop doet — als echte mobiele
apps, geen verkleinde desk.

---

## 0. Unlock (item 1 — gebouwd)

```
native A17 lockscreen (final)  --swipe up-->  /mobile  (TelefoonSphere)
```

Geen keypad, geen tweede particle-canvas, geen `/lock/pin` in dit pad.

De cijfer-PIN-code blijft in `androidPin.ts` / `PhonePinScreen.tsx` liggen.
`PIN_STANDAARD_UIT = true`: zonder record is `telefoonPinNodig()` false, de
gate ontgrendelt en gaat naar Home. Alleen een eerder gezette numeric PIN
toont nog het keypad. **Niet uitbreiden** (geen setup, geen Settings-PIN)
tot Luka dat vraagt.

Home-mockup is een echte Playwright-screenshot van `/mobile`, geen schets.

---

## 1. Navigatiemodel

Maximaal **vier primaire tabs + More**. More is een app-launcher (grid),
geen derde lijst. Lange druk op een app in More → pin naar de balk
(vervangt één van de vier). De balk is dus aanpasbaar; hieronder de default.

| Tab | Route | Wat |
|---|---|---|
| Home | `/mobile` | Telefoon-Home. Eén `TelefoonSphere`. Final. |
| Trading | `/trading` | Read-only trading app |
| AXE | `/companion` * | AXE Companion (pocket trading brain) |
| Memory | `/memory` | AXON Memory |
| More | sheet | App-grid + overige HQ-tabs |

\* `/companion` bestaat nog niet als eigen route; tot die er is opent de
tegel de Companion-schil boven bestaande HQ-oppervlakken (`/trading` chart
+ `companionToolsService` + Home-tile COMP). Ontwerp alsof het een tab is.

### More — app-launcher

Bovenste grid (grote tegels, 44px+):

| App | Route nu | Rol |
|---|---|---|
| NorthSea | `/maps-3d` | Deal desk |
| Browser | `/browser` | Safari-achtige browser |
| Developer | `/code-editor` | AXE Developer (Replit + Cursor + FlutterFlow) |
| Agents | `/agents` | Live status + Approve/Decline |
| Systems | `/infrastructure` | Mac mini / iMac / VPS + remote acties |
| Tasks | `/tasks` | Taken + notifications |

Daaronder een zoekveld en de rest van `navRegistry` in groepen
(Command / Intelligence / Systems / Phone), elke rij 44px.

Lange druk → **Pin to bar** / **Unpin**. Max 4 pins + More. Opslag:
`axe_phone_pins` (local, later account).

### Browser-uitzondering

Browser neemt het scherm over met eigen Safari-chrome (adresbalk +
onderbalk). Device Manager-tabs verdwijnen. Linksboven een kleine AXE-mark
gaat terug naar Home. Swipe-from-bottom is de native home-indicator, niet
een tweede balk.

### Overige apps

Trading, Companion, Memory, NorthSea, Developer houden de Device Manager-balk
én een **in-app segment** bovenin (hun eigen IA). Edge-to-edge, geen plaat
om de tab.

Regels:

- Tikdoel ≥ 44 CSS-px.
- Safe-area alleen: statusbalk en home-indicator.
- Matzwarte kaarten, 1px lichte rand, bovenrand iets helderder.
- Kleur in letters, niet in vlakken.
- Dark / light + transparantie **per stand** (`axe_look`, `axe_wp_dim_black`,
  `axe_wp_dim_glass`).
- Composer: op Home + dock. Mic alleen op tik. Gloed volgt `voiceStatus`.
- Engels in de UI.

---

## 2. Router → mobiel scherm

Bron: `src/app/App.tsx` + `navRegistry.ts`.

| Desktop-route | Label | Mobiel | Plek |
|---|---|---|---|
| `/` | Home (desktop) | Redirect `/mobile` | — |
| `/mobile` | Phone Home | Home (final) | Tab Home |
| `/lock` | Lock Screen | Native glance; web-glance alleen preview | niet in flow |
| `/lock/pin` | Android PIN | Dormant keypad | niet in flow |
| `/trading` | Trading | Trading app | Tab Trading |
| `/trading-intel` | Trading Intel | Intel-scherm in Trading | in-app |
| `/maps-3d` | Northsea Desk | NorthSea app | More |
| `/browser` | Browser | Safari-app | More |
| `/code-editor` | Code Editor | AXE Developer | More |
| `/memory` | Memory | AXON Memory | Tab Memory |
| `/memory/explore` | Memory explore | Terrain/lijst | in AXON |
| `/memory/trading` | Trading Memory | Trading facet | in AXON |
| `/obsidian` | Obsidian | Notes facet | in AXON |
| `/knowledge` | Knowledge Base | Docs in AXON More | in AXON |
| `/agents` | Agents | Live + Approve | More |
| `/tasks` | Tasks | Open / overdue / follow-ups | More |
| `/calendar` | Calendar | Daglijst | More |
| `/cron-manager` | Cron Manager | Schema's | More |
| `/ledger` | Ledger | Run-log, read-only | More |
| `/crewai` | CrewAI | Crew-status | More |
| `/ai-core` | AI Core | Status, geen tweede bol | More |
| `/thinkthanks` | THINKTHANKS | Inbox | More |
| `/eve` | EVE | Skills | More |
| `/finance` | Finance | Saldi, **geen send** | More |
| `/mcp` | MCP | Servers + health | More → Systems |
| `/infrastructure` | Infrastructure | Hosts + remote | More → Systems |
| `/control-plane` | Control Plane | Schedules | More → Systems |
| `/table-editor` | Table Editor | Read-first | More → Systems |
| `/terminals` | Terminals | Hosts; command = taak | More → Systems |
| `/terminal` | Terminal | Alias | verborgen |
| `/computer-use` | Computer Use | Remote-actiekaarten | More → Systems |
| `/developer` | Command Center | Status | More → Systems |
| `/apps` | Apps | Zelfde grid als More | More |
| `/status` | Status | Health | More |
| `/device` | Device Manager | Dit toestel | More → Phone |
| `/devices` | Devices | Inventory | More → Systems |
| `/settings` | Settings | Look, transparantie, mic | More → Phone |
| `/organization` | Organization | Org-boom | More |
| `/login` | Login | Buiten de schil | — |

Buiten de schil: `/float/notes`, `/float/phone`, `/northsea-desktop`,
`/browser-desktop`, `/computer-use-overlay`, alle `/dev-*`.

---

## 3. Phone Home — niet herontwerpen

Bestaande `/mobile`: TelefoonSphere, zes agent-tegels, chat, composer,
onderbalk. Mic alleen op tik. Composer-gloed volgt `voiceStatus`.

De Home-PNG in `mockups/home-*.png` is een capture van deze pagina.

---

## 4. Trading (read-only mobile app)

**Belofte:** watchlist, chart, posities, AXE Algo, intel — in de pocket.
**Nooit** Buy/Sell, order-sheet, send, modify, close.

### IA

```
Watchlist ──► Chart (symbool)
     │              │
     ├── Positions  │
     ├── Algo       │
     └── Intel  ◄───┘  (zelfde symbool)
```

In-app segment: **Markets · Chart · Positions · Algo · Intel**.
Device Manager-balk blijft, Trading actief.

### Schermen

**Markets (watchlist).** XAUUSD, BTCUSD, SPY, QQQ + eigen lijst. Bid/ask
één bron (geen drie prijzen). Sparkline 1D. Tik → Chart.

**Chart.** Companion-parity chart (`CompanionChart` / `CompanionStyleChart`):
candles, TF (1H/4H/1D), pinch/pan, crosshair, bid/ask, positie-markers
(SL/TP zichtbaar, niet sleepbaar tot execute). Geen ticket.

**Positions.** Open posities, floating P/L, risk remaining. Rij is
read-only; tik opent Chart op dat symbool. Geen close/modify.

**AXE Algo.** Status van de trading-agent: cycle, last decision, why idle,
wat hij níet mag (geen orders vanaf telefoon). Link naar Intel-run.

**Intel.** Trading Intel-samenvatting (`/trading-intel`): brief, last
research, memory-lessen. Chat met AXE over het open symbool (mic op tik).
Geen “place order” in de composer-acties.

### Flows

1. Open Trading → Markets. Tik XAUUSD → Chart 1D. Swipe TF.
2. Positions → tik rij → Chart + markers.
3. Algo rood/idle → Intel “why”.
4. Composer: “what changed on gold” → intel, geen ticket.

### Wat er is vs ontbreekt

| Nu (HQ) | Gat op 384px |
|---|---|
| `/trading` = `TradingIntel` (volle desk) | Geen watchlist-first IA |
| `CompanionChart` port | Te zwaar; order-ticket in de port **verbergen** |
| MetaAPI-posities op desk | Geen dedicated positions-lijst |
| Trading agent / cycle journal | Geen Algo-statuskaart |
| `/trading-intel` research | Geen telefoon-brief |
| Order-UI op desk | **Moet weg** op telefoon |

Bereikbaar: `TradingIntel`, `CompanionStyleChart`, MetaAPI-sync,
`cycleJournal`, `axonMemoryBridge` (schrijven), market quotes.

---

## 5. NorthSea Desk (mobile app)

**Belofte:** pipeline in de pocket. Discover → match → qualify → protect
→ connect. **Nooit send** (geen mail-fire, geen deal-execute).

### IA

```
Pipeline ──► Deal
    │          ├── Counterparties
    │          ├── Draft review
    └── Approvals (Approve / Decline, geen send)
```

In-app segment: **Pipeline · Deals · Network · Drafts · OK**.
Meer (Market, Comms, Evidence, Automation, Reports) in een in-app More,
niet in de Device Manager-balk.

Fases (uit `PIPELINE_KOLOMMEN`): New, Matched, Qualifying, Awaiting reply,
Terms, Blocked, Closing. Geen `lost` in de hoofdlijst.

### Schermen

**Pipeline.** Horizontale fase-chips + verticale deal-kaarten. Per kaart:
product, volume MT, leverancier → koper, blocker, gereedheid %, next
action. Tik → Deal.

**Deal.** Stadium, readiness, current blocker, next best action, waiting
party, evidence, approval state, last activity. Acties: Ask AXE, Open
draft, Request approval. Geen Send.

**Counterparties.** Kopers / leveranciers bij de deal. Land, KYC-status,
laatste contact. Tik → dossier (read) + “draft intro” (opent Drafts).

**Drafts review.** Gegenereerde mails/docs. Diff + commentaar. Acties:
Edit, Ask AXE, Send to approval. **Geen Send to counterparty.**

**Approvals.** Wachtrij. Echte `GoedkeuringActie` Approve / Decline 44px.
Approve = intern akkoord, niet verzenden.

### Flows

1. Pipeline → Blocked chip → deal → blocker lezen → Ask AXE.
2. Deal → Drafts → review mail → Send to approval.
3. Approvals → Approve of Decline (zelfde component als Agents).
4. Network → counterparty → draft intro (blijft concept).

### Wat er is vs ontbreekt

| Nu | Gat |
|---|---|
| `NorthseaDesk` tabs (pipeline, deals, tegenpartijen, …) | Desktop-zuil; 3D-kaart op 384px |
| `backend/axe_api/northsea*.py`, MCP :8040 | Commodities-DB incident (sinds 11 okt) |
| Chase / approvals in desk | Geen telefoon-OK-wachtrij |
| Comms-tab | Mag concepten tonen, **niet** versturen |
| Autonomievlaggen uit | Desk = review, geen autonome send |

Bereikbaar: `northseaOverzicht`, `chase.ts`, `DealsTab`, `PipelineTab`,
`TegenpartijenTab`, `DocumentenTab`, `BewijsTab`, approval kernel
(`core_tasks` wacht op goedkeuring).

---

## 6. Browser (Safari-achtige mobile app)

**Belofte:** voelt als Safari, niet als een ingebedde desktop-browser.
Adresbalk, tabs-switcher, back/forward, share, bookmarks, reader,
onderbalk.

### IA

```
Start (new tab)
  └─ Page
        ├─ Tabs switcher (grid)
        ├─ Bookmarks / History
        ├─ Reader
        ├─ Share sheet
        └─ AXE (ask / summarize / explain) — sheet, niet tweede orb
```

Chrome (Safari-model):

```
[ AXE-mark ] [ lock ] [ address / search                ]
[ page — edge to edge                                  ]
[ ← ] [ → ] [ share ] [ bookmarks ] [ tabs ]
```

Geen Device Manager-tab bar. AXE-mark → `/mobile`.

### Schermen

**Start.** Favorieten-grid (bestaande `quickLinks` + bookmarks). Recente
tabs. Search in de adresbalk (URL of query → search).

**Page.** Live WebView (`/api/browse` + `LiveBrowserView`). Adresbalk toont
titel/host; tik maakt hem editor. Progress dun bovenaan.

**Tabs switcher.** Grid van snapshots, sluit-kruis 44px, + New Tab.
Zelfde model als `useBrowserStore` tabs.

**Bookmarks.** Mappen AXE / Dev + History. Lange druk → edit/delete.

**Reader.** `fetchPageContext` tekst, typografie, look volgt `axe_look`.
Ask AXE vat samen.

**Share.** Native-achtige sheet: Copy, Bookmark, Open in system browser
(als de WebView het toelaat). Geen send naar deals/mail.

### Flows

1. More → Browser → Start. Tik GitHub → Page. Back werkt.
2. Adresbalk → `axecompanion.com` → Page.
3. Tabs → grid → switch / close / new.
4. Share → Bookmark. Bookmarks → open.
5. Reader → Ask AXE “summarize”.

### Wat er is vs ontbreekt

| Nu | Gat |
|---|---|
| `BrowserApp`, `useBrowserStore` (tabs, bookmarks, history, downloads) | Desktop-chrome; geen Safari-onderbalk |
| `AddressBar`, `TabBar`, `WebView`, `LiveBrowserView` | Tabs-switcher is geen iOS-grid |
| `fetchPageContext` + Ask/Summarize/Explain | Geen Reader-mode UI |
| Start page + quick links | OK als New Tab |
| AI panel / Browser Use / Camofox | Sheet, geen tweede bol |

Bereikbaar: store, `/api/browse`, `sendBrowserAIMessage`, bookmarks key
`axe_browser_bookmarks`, history, downloads, `StandaloneBrowserPage`
(desktop-only houden).

---

## 7. AXE Companion (mobile app tab)

**Belofte:** “Your second brain for trading” in de Device Manager-schil.
Niet de desktop-desk verkleinen. Pocket: status, chart, AXE, alerts,
account — **read-only orders**.

Canon: `docs/programma/canon/02_AXE_COMPANION_MASTER_AND_AUTONOMOUS_BUILD.md`.
Productie: `axecompanion.com` (VPS nginx). Repo: `AXE-COMPANION-OS-`.

### IA (Companion-nav, in deze schil)

```
Home (pulse) ── Markets ── Chart ── AXE ── Account
```

Device Manager-balk: **AXE** actief. Companion-segment bovenin.

### Schermen

**Home.** Account pulse: connected?, equity, daily P/L, risk remaining,
open positions count, critical alerts, upcoming events, AXE brief.
Binnen seconden, niet een dashboard vol widgets.

**Markets.** Watchlist + sessie. Zelfde quotes als Chart.

**Chart.** Zelfde engine als Trading-tab (`CompanionChart`). Portrait;
landscape later. Drawings: compact tool, geen desktop-toolbar.

**AXE.** Trading-conversatie. Quick: Analyse chart, What changed, Check
risk, Set alert (lokaal), Journal (schrijven mag), Review position,
Explain news. AXE kent actief symbool, TF, account, posities, memory.
Mic alleen op tik; composer-gloed volgt stem. **Geen order-tool.**

**Account.** Accounts (live/demo/prop), posities, risk, journal entries.
Settings: welke account actief. Geen withdraw/send.

### Flows

1. AXE-tab → Home pulse. Rood alert → Chart.
2. Home → AXE “what changed”.
3. Markets → Chart → journal note (Companion journal / `axe_memory`).
4. Account → switch demo/live (zicht, geen trade).

### Wat bereikbaar is vanuit HQ

| Pad | Wat |
|---|---|
| `companionToolsService` | `get_smart_money_intel`, `get_economic_calendar`, `get_news_headlines` (3 van 18 tools) |
| `triggerCompanionCorrelation` / `intel_correlations` | Cross-feed, 30 min |
| `CompanionChart` port | Chart in HQ Trading |
| Home-tegel COMP | Agent-tegel, geen app-shell |
| Sidecar `cfg:companion_sidecar` | Alleen loopback op de Mac — **niet** vanaf de A17 |
| `axecompanion.com` | Eigen PWA; hier ontwerpen we de in-HQ tab |
| Journal / `axe_memory` | Gedeeld Supabase `pqnngpcgbdwxavbatbia` |

Gat: vanaf de telefoon is 127.0.0.1-sidecar dood. Companion-tab moet via
VPS/`axecompanion.com` API of de drie tools + chart-port in HQ, niet via
Mac-loopback. `loopbackVerdict` zegt dat al.

---

## 8. AXON Memory (mobile app tab)

**Belofte:** AXON herinnert; AXE redeneert. Capture / Recall / Thread /
Core — geen tweede chatbot.

Canon: `docs/programma/canon/03_AXON_MEMORY_MASTER_AND_AUTONOMOUS_BUILD.md`.
Productie: `app.axon-memory.com` (verouderde bundle). HQ schrijft via
`axonMemoryService.ts` (`/remember`, `context-pack`).

### IA

```
Recall (home)
  ├─ Capture
  ├─ Thread
  ├─ Cores / Facets
  ├─ Obsidian notes
  └─ Trading memory
```

Segment: **Recall · Capture · Threads · Cores · More**.
More: Obsidian, Trading, Knowledge, Explore (lijst i.p.v. 3D).

### Schermen

**Recall.** Dominant zoekveld. Resultaten met bron. Tik → Memory-detail
(content, provenance, source app, weight). 3D neural/terrain blijft op
Home achter de wereldknop; hier is het een lijst.

**Capture.** Tekst + tags + title. Schrijft `axonRemember` (HQ-key
`axon_live_…`) én/of lokale `rag_memories` als AXON CORS blokkeert
(AXON CORS = alleen `app.axon-memory.com`). Zeg dat eerlijk in de UI.

**Thread.** Eén lopende context (wat AXON “thread” noemt vs HQ-chat).
Niet een ChatGPT-kloon: recall-pack + notities.

**Cores.** Facets: personal, trading, northsea, code. Weight/depth als
meta, niet als gamificatie.

**Obsidian.** Vault-lijst, recente notes (`/obsidian`). Tik → note.

**Trading memory.** `/memory/trading` lessen/beslissingen van de
trading-agent.

### Flows

1. Memory-tab → Recall “gold bias” → pack.
2. Capture “Luka hates keypad after lockscreen”.
3. Cores → trading → Trading memory.
4. More → Obsidian → note.

### Wat bereikbaar is

| Pad | Wat |
|---|---|
| `axonRemember` / `axonContextPack` | REST op Supabase functions; CORS blokkeert browser tenzij origin AXON is |
| HQ `/memory` hub | Neural / Terrain / Obsidian / Trading lenses |
| `rag_memories`, `agent_learning_episodes` | AXE-eigen geheugen, wél in deze app |
| `/memory/explore` | Data panels |
| `/obsidian`, `/knowledge` | Notes + docs |
| MCP `mcp.axon-memory.com` | 14 tools; geen retire/delete/update/export; GET 405 |
| `app.axon-memory.com` | Draait oude fork |

Gat: canon-nouns (Thread/Weight/Depth/Facet/Core) zitten niet in het
productieschema. Telefoon-IA gebruikt de canon-woorden; backend map
eerlijk naar `memory_items` tot AXON bij is.

---

## 9. AXE Developer (mobile app tab)

**Belofte:** Replit + Cursor + FlutterFlow in één tab. Luka gebruikt het
nu zelf; BYOK later voor anderen.

Canon: `docs/programma/canon/04_AXE_CODE_MASTER_AND_AUTONOMOUS_BUILD.md`.
Nu: `/code-editor` (`CodeEditorPage` + `MobileStudioChrome`).

### IA

```
Projects
  └─ Workspace
        ├─ Files (tree)
        ├─ Editor + mobile keyboard bar
        ├─ Agent (chat + diff review)
        ├─ Preview / Run
        ├─ Visual builder
        └─ Git (commit / PR)
```

In-app onderbalk (vervangt Device Manager níet; zit erboven als
studio-dock, 44px): **Files · Code · Agent · Preview · Git**.
Build (visual) via + op de studio-bar, zoals `MobileStudioBar`.

### Schermen

**Projects.** Recente repo's uit `claudeRepos` / workspace whitelist.
Tik → workspace. Nieuw project = taak voor de agent (“scaffold X”), geen
tweede GitHub-app. BYOK-kaart later: “your OpenAI / Anthropic / Cursor
key” — nu verborgen, alleen Luka's slots.

**Files.** Tree uit `listWorkspaceDirectory`. Tik → Editor. Lange druk →
rename/delete via bestaande file API.

**Editor.** Monaco, plaat-thema. `MobileKeyBar` (`TOETSEN`: Tab, {}, (),
pijlen, undo). Save / Run in `MobileStudioBar`.

**Agent.** Chat + `AgentActivityTrace` + `DiffEditor` + Apply patch
(`applyPatch`, `runLocalAgent` / CLI-motoren: Claude ×4, Codex ×3,
Cursor). Motor-kiezer blijft; op telefoon als sheet.

**Preview.** `PreviewPanel` / `previewStart`. Eén preview tegelijk.
Visual QA later.

**Visual builder.** Design mode in Preview (DOM-brug, `designAgentBridge`
→ Code Agent). Geen geheime tweede representatie — source is baas.
FlutterFlow-achtig: select widget → properties → “→ Code Agent”.

**Git.** `LiveGitPanel` + `AgentCommitBalk`. Commit op whitelist-repo,
**nooit** main/master (`/claude/commit`). PR: ontwerp als “open PR”
taak; desktop doet de forge. Telefoon toont status.

### Flows

1. More → Developer → Projects → AXE-CORE- → Files.
2. File → Editor → keyboard bar `{` → Save.
3. Agent “fix the PIN skip” → diff → Apply.
4. Run → Preview.
5. Build sheet → template → Agent.
6. Git → commit message → commit (niet main).

### Wat er is vs ontbreekt

| Nu | Gat |
|---|---|
| Monaco, workspace file API, search | Geen projects-home (recent/import) |
| `MobileStudioChrome` (bar, nav, key bar, new sheet) | Al telefoon; niet Safari-grade polish |
| Agent: native / OpenHands / Claude / Codex / Cursor | Motor-sheet op 384px |
| Diff + applyPatch | OK |
| PreviewPanel + designAgentBridge | Eén globale poort, 2 workers |
| LiveGitPanel | Paneel volgt API-werkmap, niet altijd gekozen repo |
| `/claude/commit` whitelist | Geen PR-flow in de UI |
| Visual builder | Niet AST-gebaseerd |
| BYOK | Ontbreekt (bewust later) |

Bereikbaar: alles in `CodeEditorPage.tsx`, `workspaceFilesService`,
`localCodeAgent`, `agent_runner.py` CLI-bruggen, `previewStart`.

---

## 10. Overige schermen (kort)

**Agents.** Waiting (Approve/Decline 44px, `GoedkeuringActie`), Working
(wat ze doen), Idle. Tik → detail.

**Tasks / notifications.** Open, overdue, follow-ups. Bel opent sheet.
Rij mag dezelfde Approve/Decline dragen.

**Systems.** Mac mini, iMac, VPS API, VPS Models. CPU/RAM/Disk.
Remote (bevestiging): Wake, screenshot, open AXE, restart worker;
VPS health/logs/restart. Geen model-load boven limiet. Geen SSH-tty.

**Settings.** Dark/light. Transparantie-slider per stand. Mic nooit auto.
Wallpaper. Geen PIN-setup.

**Chat/voice.** Composer Home + dock. Mic op tik. `voiceStatus=listening`
→ `--axe-voice-alpha`. Barge-in stopt TTS. Geen tweede orb.

---

## 11. Wat er is vs wat ontbreekt (samenvatting)

| Onderdeel | Nu | Gat |
|---|---|---|
| Native lockscreen | Final | Niet aanraken |
| Swipe → Home | Gate slaat keypad over zonder PIN | Android-app moet HQ-build opnieuw bundelen |
| Telefoon-Home + één bol | `/mobile` + `TelefoonSphere` | Blijft |
| Keypad | Code aanwezig, `PIN_STANDAARD_UIT` | Niet bouwen |
| Onderbalk | Home Desk Agents Trading More | Default → Home Trading AXE Memory More + pinbare grid |
| Trading app | Volle desk + order-UI | Watchlist-first; orders verbergen |
| NorthSea app | Desktop-zuil + kaart | Pipeline-first; nooit send |
| Browser app | Desktop BrowserApp | Safari-chrome, reader, tabs-grid |
| Companion tab | Chart-port + 3 tools + Mac-sidecar | Eigen tab; VPS i.p.v. loopback |
| AXON tab | `/memory` 3D hub; HQ schrijft `/remember` | Recall-first lijst; CORS |
| Developer tab | Mobile studio al in code-editor | Projects, git-repo-scope, PR, BYOK later |
| Approve/Decline | `GoedkeuringActie` | Primair op Agents + NorthSea OK |
| Look + transparantie | `useLook` / `useWallpaper` per stand | Settings-sliders eerste klas |
| Finance / trading send | Bestaat op desk | **Nooit** op telefoon |

---

## 12. Gefaseerd bouwplan

Geen kalender. Volgorde op wat Luka onderweg nodig heeft.

### Fase 0 — binnenkomen (deze wijziging)

Swipe → Home. Keypad dormant. Guard: één bol op Home, nul elders.
Home-screenshot blijft de mockup.

### Fase 1 — balk en launcher

1. Default pins: Home / Trading / AXE / Memory / More.
2. More als app-grid + pin-naar-balk.
3. Agents + Systems + Tasks in het grid, werkend.

### Fase 2 — Trading + Companion (read-only)

1. Trading IA: Markets → Chart → Positions → Algo → Intel.
2. Orderknoppen weg als `isAndroidShellRuntime() \|\| isMobile`.
3. Companion-tab: pulse + de drie tools + chart; geen Mac-sidecar vanaf A17.

### Fase 3 — NorthSea + Browser

1. NorthSea pipeline/deal/network/drafts/approvals; send uit.
2. Browser Safari-chrome; Device Manager-balk weg in deze app.

### Fase 4 — AXON + Developer

1. AXON recall/capture op HQ-geheugen; AXON REST via VPS-proxy (CORS).
2. Developer projects + git op gekozen repo; PR als taak.
3. Visual builder blijft source-of-truth.

Elke fase: Playwright A17, één `TelefoonSphere` op Home, nul particle-PIN,
lockscreen en Home visueel ongewijzigd. Geen orders, geen sends.

---

## 13. Visuele regels (niet onderhandelen)

1. Luka's lockscreen-screenshot is de glance. Niet nabouwen.
2. Phone Home blijft huidige `/mobile` — mockup = echte screenshot.
3. Geen particle/canvas-bol behalve `TelefoonSphere` op Home.
4. Geen platen om niet-Home-tabs.
5. Matzwarte kaarten, dunne lichte rand, kleur in letters.
6. 44px tikdoelen. Approve/Decline als woorden, geen icoon-only.
7. Engels in de UI. Nederlands in commits.
8. Geen orders, geen sends, geen money-move.

Mockups: `docs/device-manager/mockups/*.html` (statisch, 384×832).
PNG’s ernaast, dark (`*-dark.png`) en light (`*-light.png`).
Home is **geen** HTML-schets: `home-dark.png` / `home-light.png` zijn
Playwright-captures van `/mobile`.

Contact sheets: `contact-{trading,northsea,browser,companion,axon,developer,shell}-{dark,light}.png`.

Schermen (elk dark+light):

- Trading: watchlist, chart, positions, algo, intel
- NorthSea: pipeline, deal, counterparties, drafts, approvals
- Browser: start, page, tabs, bookmarks, reader
- Companion: home, markets, chart, axe, account
- AXON: home, capture, thread, cores, obsidian, trading
- Developer: projects, files, editor, agent, preview, builder, git
- Shell: more, more-pins, agents, systems, tasks, notifications, settings, chat
- `pin.html` = dormant keypad (niet in de flow)

Regenereren: `node docs/device-manager/mockups/build.mjs && node docs/device-manager/mockups/shot.mjs`.
Daarna Home-PNGs niet overschrijven — die komen uit `e2e/phone-a17/shots/`.
