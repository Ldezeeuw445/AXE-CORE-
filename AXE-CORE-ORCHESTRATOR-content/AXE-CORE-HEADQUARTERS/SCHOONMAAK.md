# SCHOONMAAK.md — dood en dubbel in AXE Core

Gemeten op 2026-09-09, tak `orchestrator`, door COWORK 2 (schoonmaak-sessie).

Ik heb geen bestaande code aangeraakt. Dit rapport en `src/domain/dodeCode.test.ts` zijn de twee
nieuwe bestanden die ik oplever. Wat er weg mag, beslist Luka — drie andere sessies werken in de
bestanden die hieronder genoemd worden.

## Het onderscheid dat telt

**Dood** — de code staat in een bestand dat vanaf `src/app/main.tsx` (de enige ingang van de app,
zie `index.html`) via geen enkele import-keten te bereiken is. Niets in de draaiende app kan het
ooit aanroepen, ongeacht wat er ín het bestand gebeurt.

**Niet aangesloten** — het bestand zelf draait wél mee in de app, maar deze ene geëxporteerde
functie heeft geen aanroeper die zelf bereikbaar is. Vaak roept alleen een test hem aan, of alleen
een ander dood bestand. Dit is het geval dat vandaag zes keer geld heeft gekost: gebouwd, getest,
de leiding nooit aangesloten. Hier gaat werk verloren als je het weggooit — de functie doet wat hij
moet doen, hij mist alleen een aanroep vanuit de plek waar hij nuttig zou zijn.

## Methode

1. **Bereikbaarheidsgraaf.** Ik heb elke `import`/`export ... from`/dynamische `import()` in
   `src/**/*.{ts,tsx}` opgelost (zowel relatieve paden als het `@/`-alias naar `src/`) en vanaf
   `src/app/main.tsx` een breedte-eerst-zoektocht gedaan. Alles wat daarbij niet bezocht wordt, is
   **dood**: er bestaat geen importketen van de ingang van de app naar dat bestand.
2. **Aanroepers per export.** Voor elke `export function`, `export async function` en
   `export const naam = (...) => ...` op het hoogste niveau van een bestand heb ik met een
   woordgrens-zoekopdracht gekeken of de naam ergens anders voorkomt: in een ander bronbestand, in
   een testbestand, in de gebouwde bundel (`dist/`), of in de Python-backend.
3. **De val vermeden — twee keer.** Ik heb niet alleen `grep -r` op `src/` gedaan (val 2 in
   AGENTS.md), maar ook `dist/` doorzocht — als een naam daar wél in staat, is hij tijdens het
   bouwen ergens vandaan bereikt, ook als mijn eigen zoekopdracht de aanroeper niet vond. Zulke
   gevallen noem ik expliciet *onbepaald*, niet dood.

**Beperking, eerlijk gezegd:** een woordgrens-zoekopdracht is geen typechecker. Bestanden onder
`src/infrastructure/gateways/**` en `src/infrastructure/persistence/**` groeperen vaak losse
functies in een object (`export const gateway = { getX, getY }`) en roepen ze verderop aan als
`gateway.getX()` — dan vindt mijn zoekopdracht geen directe aanroep van `getX` terwijl de functie
wel degelijk draait. Ik heb die twee mappen daarom apart gehouden in de tabellen hieronder: zie ze
als een aanwijzing om handmatig te controleren, niet als een vonnis.

`npx eslint src` (voor de 21 bekende ongebruikte variabelen) liep in deze sessie vast op de
netwerkschijf — na 170 seconden nog geen resultaat. Niet geverifieerd hier; draai hem lokaal.

## Samenvatting

| Categorie | Aantal |
|---|---|
| Bestanden onbereikbaar vanaf `main.tsx` (dood) | 134 |
| Exports in een levend bestand, alléén aangeroepen door hun eigen test | 54 |
| Exports in een levend bestand, alléén aangeroepen vanuit een dood bestand | 15 |
| Exports in een levend bestand, nergens aangeroepen — zelfs niet in een test | 167 |
| Exports met geen gevonden aanroeper in de broncode, maar wél in `dist/` (onbepaald) | 49 |
| Herhaalde CSS-selectors in `axe-look.css` (zelfde selector, meerdere plekken) | 13 |
| Dezelfde eigenschap twee keer binnen dezelfde selector in `axe-look.css` | 9 |

---

## 1. Dode bestanden — onbereikbaar vanaf `src/app/main.tsx`

134 bestanden (134 van de 603 niet-test bronbestanden — bijna 1 op de 5).
Geen enkele importketen vanaf de ingang van de app komt hier langs. Gegroepeerd per gebied:

### `src/presentation/components/` — 86 bestand(en)

- `src/presentation/components/ai/AISidebar.tsx`  — *bevestigd: genoemd in WERKVERDELING.md: nul importeurs*
- `src/presentation/components/axe-core/AgentChatHub.tsx`
- `src/presentation/components/axe-core/ArchitectureCanvas.tsx`
- `src/presentation/components/axe-core/ArchitectureRedesign.tsx`
- `src/presentation/components/axe-core/ChatToolbar.tsx`
- `src/presentation/components/axe-core/CodeEditor.tsx`
- `src/presentation/components/axe-core/CodeStudioNameDialog.tsx`
- `src/presentation/components/axe-core/DesignAgentWireHost.tsx`
- `src/presentation/components/axe-core/FloatingParticleSphere.tsx`
- `src/presentation/components/axe-core/MemoryPanel.tsx`
- `src/presentation/components/axe-core/OrganizationCanvas.tsx`
- `src/presentation/components/axe-core/SidebarChat.tsx`
- `src/presentation/components/axe-core/sphere/projections/Map3DProjection.tsx`
- `src/presentation/components/axe-core/sphere/projections/MapProjection.tsx`
- `src/presentation/components/browser/AxeSpherePanel.tsx`
- `src/presentation/components/browser/BookmarkPanel.tsx`
- `src/presentation/components/browser/DownloadPanel.tsx`
- `src/presentation/components/browser/HistoryPanel.tsx`
- `src/presentation/components/browser/NavigationBar.tsx`
- `src/presentation/components/browser/Sidebar.tsx`
- `src/presentation/components/browser/SidebarPanels.tsx`
- `src/presentation/components/maps3d/D3HeatmapOverlay.tsx`
- `src/presentation/components/maps3d/LiveOsintLayer.tsx`
- `src/presentation/components/maps3d/MapsViewer.tsx`
- `src/presentation/components/maps3d/SplashCard.tsx`
- `src/presentation/components/shared/GlassPanel.tsx`
- `src/presentation/components/trading/companion/ChartThemeTogglerButton.tsx`
- `src/presentation/components/trading/companion/LockIconSvg.tsx`
- `src/presentation/components/trading/companion/brokerTypes.ts`
- `src/presentation/components/trading/companion/index.ts`
- `src/presentation/components/ui/accordion.tsx`
- `src/presentation/components/ui/alert-dialog.tsx`
- `src/presentation/components/ui/alert.tsx`
- `src/presentation/components/ui/aspect-ratio.tsx`
- `src/presentation/components/ui/avatar.tsx`
- `src/presentation/components/ui/badge.tsx`
- `src/presentation/components/ui/breadcrumb.tsx`
- `src/presentation/components/ui/button-group.tsx`
- `src/presentation/components/ui/button.tsx`
- `src/presentation/components/ui/calendar.tsx`
- `src/presentation/components/ui/card.tsx`
- `src/presentation/components/ui/carousel.tsx`
- `src/presentation/components/ui/chart.tsx`
- `src/presentation/components/ui/checkbox.tsx`
- `src/presentation/components/ui/collapsible.tsx`
- `src/presentation/components/ui/context-menu.tsx`
- `src/presentation/components/ui/drawer.tsx`
- `src/presentation/components/ui/dropdown-menu.tsx`
- `src/presentation/components/ui/empty.tsx`
- `src/presentation/components/ui/field.tsx`
- `src/presentation/components/ui/form.tsx`
- `src/presentation/components/ui/hover-card.tsx`
- `src/presentation/components/ui/input-group.tsx`
- `src/presentation/components/ui/input-otp.tsx`
- `src/presentation/components/ui/input.tsx`
- `src/presentation/components/ui/item.tsx`
- `src/presentation/components/ui/kbd.tsx`
- `src/presentation/components/ui/label.tsx`
- `src/presentation/components/ui/menubar.tsx`
- `src/presentation/components/ui/navigation-menu.tsx`
- `src/presentation/components/ui/pagination.tsx`
- `src/presentation/components/ui/popover.tsx`
- `src/presentation/components/ui/progress.tsx`
- `src/presentation/components/ui/radio-group.tsx`
- `src/presentation/components/ui/resizable.tsx`
- `src/presentation/components/ui/scroll-area.tsx`
- `src/presentation/components/ui/select.tsx`
- `src/presentation/components/ui/separator.tsx`
- `src/presentation/components/ui/sidebar.tsx`
- `src/presentation/components/ui/skeleton.tsx`
- `src/presentation/components/ui/slider.tsx`
- `src/presentation/components/ui/sonner.tsx`
- `src/presentation/components/ui/spinner.tsx`
- `src/presentation/components/ui/table.tsx`
- `src/presentation/components/ui/tabs.tsx`
- `src/presentation/components/ui/textarea.tsx`
- `src/presentation/components/ui/toggle-group.tsx`
- `src/presentation/components/ui/toggle.tsx`
- `src/presentation/components/ui/tooltip.tsx`
- `src/presentation/components/voice/VoiceButton.tsx`
- `src/presentation/components/widgets/HabitTrackerWidget.tsx`
- `src/presentation/components/widgets/MetricDisplay.tsx`
- `src/presentation/components/widgets/MiniChart.tsx`
- `src/presentation/components/widgets/ProgressRing.tsx`
- `src/presentation/components/widgets/SmartHomeWidget.tsx`
- `src/presentation/components/widgets/SmartRingWidget.tsx`

### `src/presentation/pages/` — 11 bestand(en)

- `src/presentation/pages/HomeStage.tsx`
- `src/presentation/pages/MemoryObsidianTab.tsx`
- `src/presentation/pages/StubPage.tsx`
- `src/presentation/pages/tradingIntel/AccountBookCard.tsx`
- `src/presentation/pages/tradingIntel/AccountColumns.tsx`
- `src/presentation/pages/tradingIntel/AccountScorecard.tsx`
- `src/presentation/pages/tradingIntel/AgentOverviewPanel.tsx`
- `src/presentation/pages/tradingIntel/PnlCalendar.tsx`
- `src/presentation/pages/tradingIntel/StatusStrip.tsx`
- `src/presentation/pages/tradingIntel/scorecardParts.tsx`
- `src/presentation/pages/tradingIntel/useAccountBooks.ts`

### `src/infrastructure/gateways/` — 7 bestand(en)

- `src/infrastructure/gateways/computerRelay.ts`  — *bevestigd: genoemd in WERKVERDELING.md (CLAUDE CODE-sessie): bestaat, wordt door niets aangeroepen*
- `src/infrastructure/gateways/e2bService.ts`
- `src/infrastructure/gateways/livekitService.ts`
- `src/infrastructure/gateways/maps3d/ollamaApi.ts`
- `src/infrastructure/gateways/openhands.ts`
- `src/infrastructure/gateways/qdrantService.ts`
- `src/infrastructure/gateways/repoHealthService.ts`

### `src/domain/tradingIntel/` — 4 bestand(en)

- `src/domain/tradingIntel/accountStats.ts`
- `src/domain/tradingIntel/phaseScorecard.ts`
- `src/domain/tradingIntel/tradeCsv.ts`
- `src/domain/tradingIntel/transientError.ts`

### `src/presentation/maps3d/` — 4 bestand(en)

- `src/presentation/maps3d/audio.ts`
- `src/presentation/maps3d/eventIcons.tsx`
- `src/presentation/maps3d/exportMap.ts`
- `src/presentation/maps3d/useGoogleMaps3D.ts`

### `src/infrastructure/persistence/` — 3 bestand(en)

- `src/infrastructure/persistence/boundedLocalStorage.ts`
- `src/infrastructure/persistence/runtimeLayoutService.ts`
- `src/infrastructure/persistence/sharedMemory.ts`

### `src/presentation/hooks/` — 3 bestand(en)

- `src/presentation/hooks/useIsWide.ts`
- `src/presentation/hooks/useLiveKit.ts`
- `src/presentation/hooks/useRealTerminal.ts`

### `src/application/agents/` — 2 bestand(en)

- `src/application/agents/agenticEditBridge.ts`
- `src/application/agents/agenticEngine.ts`  — *bevestigd: genoemd in WERKVERDELING.md (CLAUDE-SESSIE 2): nog niet in de leerlus gezet*

### `src/app/browser-demo-main.tsx/` — 1 bestand(en)

- `src/app/browser-demo-main.tsx`

### `src/app/shell-main.tsx/` — 1 bestand(en)

- `src/app/shell-main.tsx`

### `src/app/stage-main.tsx/` — 1 bestand(en)

- `src/app/stage-main.tsx`

### `src/application/crew/` — 1 bestand(en)

- `src/application/crew/runCrewWithTools.ts`

### `src/application/sphere/` — 1 bestand(en)

- `src/application/sphere/toolBridge.ts`

### `src/application/tools/` — 1 bestand(en)

- `src/application/tools/toolRegistry.computer.ts`  — *bevestigd: importeert computerRelay, is zelf ook niet bereikbaar vanaf main.tsx*

### `src/application/tradingIntel/` — 1 bestand(en)

- `src/application/tradingIntel/researchRotation.ts`

### `src/domain/chatEndpoint.ts/` — 1 bestand(en)

- `src/domain/chatEndpoint.ts`

### `src/domain/chatRouting.ts/` — 1 bestand(en)

- `src/domain/chatRouting.ts`

### `src/domain/panelGrid.ts/` — 1 bestand(en)

- `src/domain/panelGrid.ts`

### `src/domain/types/` — 1 bestand(en)

- `src/domain/types/speech.d.ts`

### `src/infrastructure/maps/` — 1 bestand(en)

- `src/infrastructure/maps/googleMaps3DLoader.ts`

### `src/infrastructure/supabase/` — 1 bestand(en)

- `src/infrastructure/supabase/ontwerpData.leeg.ts`

### `src/infrastructure/ui/` — 1 bestand(en)

- `src/infrastructure/ui/nativePrompt.ts`

**Wat dit waarschijnlijk is, per gebied** (Luka's oordeel nodig, ik gok niet):
- `presentation/components/ui/**` (ruim 40 bestanden): shadcn/ui-primitieven die de generator heeft
  neergezet maar die geen enkele pagina importeert. Typisch een scaffold waarvan een deel nooit is
  gebruikt.
- `presentation/components/axe-core/**`, `presentation/components/browser/**`,
  `presentation/components/maps3d/**`, `presentation/components/widgets/**`: grotere afgeronde
  features (chat-hub, organisatie-canvas, browser-zijpanelen, maps3d-lagen, dashboard-widgets) die
  wel compleet ogen maar nergens aan een route of ouder-component hangen.
- `infrastructure/gateways/*Service.ts` (e2b, livekit, qdrant, openhands, ollama, repoHealth):
  losse externe-dienst-koppelingen, elk compleet, geen van alle aangesloten.
- `app/browser-demo-main.tsx`, `app/shell-main.tsx`, `app/stage-main.tsx`: dit zijn zelf
  entry-achtige bestanden — mogelijk bedoeld als alternatieve build-targets (zie `vite.config.ts`
  voor losse build-commando's) en dus vals-positief voor 'dood'. Controleer `vite.config.ts` /
  `package.json`-scripts voor je deze aanraakt.

---

## 2. Niet aangesloten — het bestand leeft, deze export niet

### 2a. Alléén aangeroepen door zijn eigen test

54 functies. Getest, dus iemand heeft ze gebouwd en geverifieerd — maar de
productiecode roept ze nooit aan. Dit is precies het patroon van de zes gevallen van vandaag.

| Functie | Bestand | Regel | Test die hem aanroept |
|---|---|---|---|
| `flaggedBudget` | `src/application/tradingIntel/agentAutopilot.ts` | 198 | `src/application/tradingIntel/scanRotation.test.ts`, `src/application/tradingIntel/flaggedBudget.test.ts` |
| `nextScanWindow` | `src/application/tradingIntel/agentAutopilot.ts` | 286 | `src/application/tradingIntel/scanRotation.test.ts` |
| `axonKey` | `src/application/tradingIntel/axonMemoryBridge.ts` | 54 | `src/application/tradingIntel/axonMemoryBridge.test.ts` |
| `upstreamBlock` | `src/application/tradingIntel/deskAgents.ts` | 51 | `src/application/tradingIntel/upstream.test.ts` |
| `isUsableIntel` | `src/application/tradingIntel/tradingAgentEngine.ts` | 821 | `src/application/tradingIntel/intelFreshness.test.ts` |
| `otherLook` | `src/domain/look.ts` | 65 | `src/domain/look.test.ts` |
| `isLoopbackUrl` | `src/domain/loopback.ts` | 47 | `src/domain/loopback.test.ts` |
| `meaningOfFreshness` | `src/domain/meaning.ts` | 116 | `src/domain/meaning.test.ts` |
| `meaningOfStage` | `src/domain/meaning.ts` | 89 | `src/domain/meaning.test.ts` |
| `meaningOfTest` | `src/domain/meaning.ts` | 68 | `src/domain/meaning.test.ts` |
| `isLoopAgent` | `src/domain/memory/agentLoop.ts` | 44 | `src/domain/memory/agentLoop.test.ts` |
| `modelsFor` | `src/domain/modelCatalog.ts` | 74 | `src/domain/modelCatalog.test.ts` |
| `verdeel` | `src/domain/serviceStatus.ts` | 40 | `src/domain/serviceStatus.test.ts` |
| `cycleReach` | `src/domain/tradingIntel/cycleJournal.ts` | 144 | `src/domain/tradingIntel/cycleJournal.test.ts` |
| `verdictsOf` | `src/domain/tradingIntel/cycleJournal.ts` | 197 | `src/domain/tradingIntel/verdictDedup.test.ts` |
| `atrPct` | `src/domain/tradingIntel/decisionFunnel.ts` | 121 | `src/domain/tradingIntel/decisionFunnel.test.ts` |
| `rewardToRisk` | `src/domain/tradingIntel/decisionFunnel.ts` | 184 | `src/domain/tradingIntel/decisionFunnel.test.ts` |
| `strengthScore` | `src/domain/tradingIntel/decisionFunnel.ts` | 142 | `src/domain/tradingIntel/decisionFunnel.test.ts` |
| `forRun` | `src/domain/tradingIntel/deskDecisions.ts` | 129 | `src/domain/tradingIntel/deskDecisions.test.ts` |
| `summariseDecision` | `src/domain/tradingIntel/deskDecisions.ts` | 140 | `src/domain/tradingIntel/deskDecisions.test.ts` |
| `currenciesOf` | `src/domain/tradingIntel/economicCalendar.ts` | 96 | `src/domain/tradingIntel/economicCalendar.test.ts` |
| `learningSignal` | `src/domain/tradingIntel/funnelAnalytics.ts` | 185 | `src/domain/tradingIntel/funnelAnalytics.test.ts` |
| `parseTag` | `src/domain/tradingIntel/funnelAnalytics.ts` | 79 | `src/domain/tradingIntel/funnelAnalytics.test.ts` |
| `pairSpec` | `src/domain/tradingIntel/pairRegistry.ts` | 100 | `src/domain/tradingIntel/pairRegistry.test.ts` |
| `removePreset` | `src/domain/tradingIntel/riskPresets.ts` | 146 | `src/domain/tradingIntel/riskPresets.test.ts` |
| `upsertPreset` | `src/domain/tradingIntel/riskPresets.ts` | 140 | `src/domain/tradingIntel/riskPresets.test.ts` |
| `airtopEndSession` | `src/infrastructure/gateways/airtopService.ts` | 110 | `src/infrastructure/gateways/airtopService.test.ts` |
| `airtopListSessions` | `src/infrastructure/gateways/airtopService.ts` | 105 | `src/infrastructure/gateways/airtopService.test.ts` |
| `axonContextPack` | `src/infrastructure/gateways/axonMemoryService.ts` | 156 | `src/infrastructure/gateways/axonMemory.test.ts` |
| `looksLikeAxonKey` | `src/infrastructure/gateways/axonMemoryService.ts` | 56 | `src/infrastructure/gateways/axonMemory.test.ts` |
| `assertTradeable` | `src/infrastructure/gateways/marketDataService.ts` | 246 | `src/infrastructure/gateways/marketDataService.test.ts` |
| `__resetBudget` | `src/infrastructure/gateways/metaApiBudget.ts` | 275 | `src/infrastructure/gateways/metaApiSymbols.test.ts`, `src/infrastructure/gateways/metaApiBudget.test.ts` |
| `__setBudgetLimits` | `src/infrastructure/gateways/metaApiBudget.ts` | 262 | `src/infrastructure/gateways/metaApiBudget.test.ts` |
| `isQuotaRefusal` | `src/infrastructure/gateways/metaApiBudget.ts` | 193 | `src/infrastructure/gateways/metaApiBudget.test.ts` |
| `metaApiBudgetState` | `src/infrastructure/gateways/metaApiBudget.ts` | 237 | `src/infrastructure/gateways/metaApiBudget.test.ts` |
| `ttlFor` | `src/infrastructure/gateways/metaApiBudget.ts` | 173 | `src/infrastructure/gateways/metaApiBudget.test.ts` |
| `__forgetDeployment` | `src/infrastructure/gateways/metaApiService.ts` | 713 | `src/infrastructure/gateways/preflight.test.ts` |
| `__resetSymbolCache` | `src/infrastructure/gateways/metaApiService.ts` | 435 | `src/infrastructure/gateways/metaApiSymbols.test.ts` |
| `__resetTradeModeCache` | `src/infrastructure/gateways/metaApiService.ts` | 353 | `src/infrastructure/gateways/metaApiSymbols.test.ts` |
| `__settleTradeModes` | `src/infrastructure/gateways/metaApiService.ts` | 427 | `src/infrastructure/gateways/metaApiSymbols.test.ts` |
| `accountIsDeployed` | `src/infrastructure/gateways/metaApiService.ts` | 717 | `src/infrastructure/gateways/preflight.test.ts` |
| `readTradeResult` | `src/infrastructure/gateways/metaApiService.ts` | 798 | `src/infrastructure/gateways/tradeResult.test.ts` |
| `dailyCapFor` | `src/infrastructure/gateways/researchSources.ts` | 322 | `src/infrastructure/gateways/researchBudget.test.ts` |
| `eodhdTickerFor` | `src/infrastructure/gateways/researchSources.ts` | 351 | `src/infrastructure/gateways/researchSources.test.ts` |
| `polygonTickerFor` | `src/infrastructure/gateways/researchSources.ts` | 99 | `src/infrastructure/gateways/researchSources.test.ts` |
| `formatForPrompt` | `src/infrastructure/persistence/agentMemoryService.ts` | 220 | `src/infrastructure/persistence/agentMemoryService.test.ts` |
| `mergeNewestFirst` | `src/infrastructure/persistence/agentMemoryService.ts` | 204 | `src/infrastructure/persistence/agentMemoryService.test.ts` |
| `selectTradeable` | `src/infrastructure/persistence/tradingAccountsService.ts` | 338 | `src/infrastructure/persistence/tradeableAccounts.test.ts` |
| `readNamespace` | `src/infrastructure/persistence/tradingAgentBrain.ts` | 252 | `src/infrastructure/persistence/tradingAgentBrain.test.ts` |
| `recordLesson` | `src/infrastructure/persistence/tradingAgentBrain.ts` | 195 | `src/infrastructure/persistence/tradingAgentBrain.test.ts` |
| `ledgerKey` | `src/infrastructure/persistence/tradingLedgerService.ts` | 142 | `src/infrastructure/persistence/ledgerRuns.test.ts` |
| `ledgerStats` | `src/infrastructure/persistence/tradingLedgerService.ts` | 195 | `src/infrastructure/persistence/ledgerPlausibility.test.ts` |
| `liveRecordIsPlausible` | `src/infrastructure/persistence/tradingLedgerService.ts` | 188 | `src/infrastructure/persistence/ledgerPlausibility.test.ts` |
| `normRun` | `src/infrastructure/persistence/tradingLedgerService.ts` | 128 | `src/infrastructure/persistence/ledgerRuns.test.ts` |

### 2b. Alléén aangeroepen vanuit een dood bestand

15 functies. De aanroeper bestaat en werkt inhoudelijk — maar hij zit zelf in
een bestand uit hoofdstuk 1, dat de bundel nooit haalt. Sterkste bewijs in dit rapport: `sendToAI`
in `src/application/agents/aiAgent.ts` wordt aangeroepen door `AISidebar.tsx` (WERKVERDELING.md
noemt dat bestand al: nul importeurs) én heeft een eigen test in `learningLoopWiring.test.ts`. Werkend,
getest, en de enige plek die hem gebruikt is zelf uit de bundel gesneden.

| Functie | Bestand | Regel | Enige aanroeper (dood bestand) |
|---|---|---|---|
| `sendToAI` | `src/application/agents/aiAgent.ts` | 180 | `src/presentation/components/ai/AISidebar.tsx` |
| `executeCodeEdit` | `src/application/agents/codeEditorAgent.ts` | 140 | `src/application/agents/agenticEngine.ts`, `src/application/agents/agenticEditBridge.ts` |
| `resolveChartFromSeries` | `src/application/sphere/projectionResolvers/chartResolver.ts` | 173 | `src/application/sphere/toolBridge.ts` |
| `resolveMapFromCoords` | `src/application/sphere/projectionResolvers/mapResolver.ts` | 241 | `src/application/sphere/toolBridge.ts` |
| `isLook` | `src/domain/look.ts` | 39 | `src/presentation/pages/HomeStage.tsx` |
| `needsApproval` | `src/domain/tools/riskTiers.ts` | 136 | `src/application/tools/toolRegistry.computer.ts`, `src/infrastructure/gateways/computerRelay.ts` |
| `getPrimaryRepo` | `src/infrastructure/gateways/githubCodeService.ts` | 56 | `src/application/agents/agenticEngine.ts` |
| `buildCrewToolEnv` | `src/infrastructure/persistence/crewToolsConfigService.ts` | 43 | `src/application/crew/runCrewWithTools.ts` |
| `getCrewToolStatus` | `src/infrastructure/persistence/crewToolsConfigService.ts` | 31 | `src/application/crew/runCrewWithTools.ts` |
| `addHabitProgress` | `src/infrastructure/persistence/habitTrackerService.ts` | 107 | `src/presentation/components/widgets/HabitTrackerWidget.tsx` |
| `removeHabit` | `src/infrastructure/persistence/habitTrackerService.ts` | 136 | `src/presentation/components/widgets/HabitTrackerWidget.tsx` |
| `setHabitProgress` | `src/infrastructure/persistence/habitTrackerService.ts` | 99 | `src/presentation/components/widgets/HabitTrackerWidget.tsx` |
| `upsertHabitDef` | `src/infrastructure/persistence/habitTrackerService.ts` | 124 | `src/presentation/components/widgets/HabitTrackerWidget.tsx` |
| `rijenVoor` | `src/infrastructure/supabase/ontwerpData.ts` | 123 | `src/infrastructure/supabase/ontwerpData.leeg.ts` |
| `DetailPanel` | `src/presentation/pages/Organization.tsx` | 94 | `src/presentation/components/axe-core/OrganizationCanvas.tsx` |

### 2c. Nergens aangeroepen — zelfs niet in een test

167 functies. Geen test, geen andere aanroeper, ook niet vanuit een dood bestand. Van alle
vondsten in dit rapport is dit de categorie die het dichtst bij 'gewoon weg kan' zit — maar lees
eerst de kanttekening bij `gateways/` en `persistence/` hierboven: een deel hiervan hangt mogelijk
aan een object-export die mijn zoekopdracht niet doorziet.

| Bestand | Functies |
|---|---|
| `src/application/agents/codeEditorAgent.ts` | `clearPendingEdit`, `getRecentEdits`, `getEditStats` |
| `src/application/browser/browserAIService.ts` | `pollBrowserAITask`, `getBrowserAIHealth` |
| `src/application/system/axeBootstrap.ts` | `maybeDailyGreeting`, `maybeNightlyReview`, `maybeSeedObsidianWelcome`, `warmPrimaryAtBoot`, `maybeSyncObsidianVault`, `warmLocalOllamaAtBoot` |
| `src/application/system/systemService.ts` | `getServiceState` |
| `src/application/tools/toolRegistry.phone.ts` | `phoneStatusLine` |
| `src/application/tradingIntel/agentAutopilot.ts` | `isAutopilotEnabled`, `getAutopilotIntervalMin`, `maybeSelfTest` |
| `src/application/tradingIntel/cycleJournalService.ts` | `loadCycleJournal` |
| `src/application/tradingIntel/deskAgentModels.ts` | `modelForAgent` |
| `src/application/tradingIntel/deskDecisionsService.ts` | `gradeDecision` |
| `src/application/tradingIntel/liveTradeReconciler.ts` | `validStrategyTag`, `decisionFromTag` |
| `src/application/tradingIntel/tradingAgentEngine.ts` | `latestIntelForSymbol` |
| `src/application/workflows/workflowBuilder.ts` | `intentToWorkflowSpec`, `validateWorkflowSpec` |
| `src/domain/catalogs/eveSkills.ts` | `getAllEveSkills` |
| `src/domain/memory/hubClassifier.ts` | `hubForAgentRow` |
| `src/domain/proxyProvider.ts` | `wordtHernoemd` |
| `src/domain/replyLanguage.ts` | `ttsPreviewLine` |
| `src/domain/skills/skillCatalog.ts` | `getBuiltinSkill`, `skillsByCategory` |
| `src/domain/tools/toolSchemas.ts` | `promptBudget` |
| `src/domain/tradingIntel/decisionFunnel.ts` | `meanOfLast`, `returnsOf` |
| `src/infrastructure/config/audioUnlock.ts` | `isAudioUnlocked` |
| `src/infrastructure/config/providerConnectionDefaults.ts` | `getDefaultProviderBaseUrl`, `getProxyProviderBaseUrl` |
| `src/infrastructure/gateways/airtopService.ts` | `airtopReachable`, `airtopLoadUrl`, `airtopClose` |
| `src/infrastructure/gateways/axeCoreApiService.ts` | `claimDurableTask`, `heartbeatDurableTask`, `transitionDurableTask`, `requestDurableTaskApproval`, `decideDurableTaskApproval`, `memStats`, `n8nGetWorkflow`, `n8nUpdateWorkflow`, `n8nActivate`, `n8nDeactivate`, `n8nExecute`, `n8nListExecutions`, `ghListRepos`, `vercelGetDeployment`, `apiListTasks`, `apiGetTask`, `apiApproveTask`, `apiRejectTask`, `apiGetPatch`, `apiHookN8n`, `apiHookLangGraph`, `apiRunLangGraph`, `apiExecuteCrewAI`, `apiAgentsStatus`, `apiTriggerN8n`, `mcpListServers`, `mcpSaveServers` |
| `src/infrastructure/gateways/brokerConnector.ts` | `setBrokerConnection`, `brokerAccountSummary` |
| `src/infrastructure/gateways/companionToolsService.ts` | `triggerCompanionCorrelation` |
| `src/infrastructure/gateways/exaSearchService.ts` | `saveExaApiKey` |
| `src/infrastructure/gateways/globalTts.ts` | `getActiveTtsProvider`, `stopGlobalTts` |
| `src/infrastructure/gateways/kimiClawService.ts` | `clawScrape`, `clawDeepResearch`, `kimiCodeDebug`, `kimiWorkAnalyzeDocument`, `kimiWorkExtractEntities`, `browserSession`, `browserCloseSession`, `browserHealth` |
| `src/infrastructure/gateways/localBridgeService.ts` | `localBridgeUnavailableReason`, `isLocalBridgeUp`, `localList` |
| `src/infrastructure/gateways/localOllama.ts` | `invalidateLocalOllamaProbe`, `listLocalOllamaModels` |
| `src/infrastructure/gateways/lseGateway.ts` | `lseCatalog`, `lseCandles`, `lseSeries` |
| `src/infrastructure/gateways/metaApiBudget.ts` | `__budgetLimits` |
| `src/infrastructure/gateways/metaApiService.ts` | `clearMetaApiConfig`, `metaApiListSymbols`, `metaApiListSymbolsFor`, `metaApiCancelOrder` |
| `src/infrastructure/gateways/n8nService.ts` | `listWorkflows`, `getWorkflow`, `deleteWorkflow`, `triggerWebhook`, `getExecutions`, `getExecution`, `retryExecution`, `deleteExecution` |
| `src/infrastructure/gateways/phoneBridgeService.ts` | `phoneIsReady` |
| `src/infrastructure/gateways/researchSources.ts` | `perigonLimits`, `saveResearchSourceKeys`, `fetchEodHistory` |
| `src/infrastructure/gateways/unusualWhalesGateway.ts` | `__resetUwKeyCache`, `fetchMarketTide`, `fetchFlowAlerts` |
| `src/infrastructure/gateways/whisperService.ts` | `resolveWhisperConfig`, `transcribeAudio`, `recordUtterance`, `isRecording` |
| `src/infrastructure/gateways/windowManagerService.ts` | `listMonitors`, `restoreWindowLayout` |
| `src/infrastructure/persistence/crewToolsConfigService.ts` | `saveCrewToolsConfig` |
| `src/infrastructure/persistence/demoTradingService.ts` | `positionFor` |
| `src/infrastructure/persistence/embeddingService.ts` | `localEmbed` |
| `src/infrastructure/persistence/llmModelRegistryService.ts` | `getDefaultLlmModelRegistry`, `loadLlmModelRegistry` |
| `src/infrastructure/persistence/memoryStatsService.ts` | `getMemoryGrowthHistory` |
| `src/infrastructure/persistence/repoConfigService.ts` | `setCodeWriteMode` |
| `src/infrastructure/persistence/runtimeEditsService.ts` | `loadAgentOverrides` |
| `src/infrastructure/persistence/thinkThanksService.ts` | `getThinkThanksItem`, `upsertThinkThanksItem`, `isInstagramUrl`, `extractUrls` |
| `src/infrastructure/persistence/tradeNotesService.ts` | `tradeNoteMarkdown` |
| `src/infrastructure/persistence/tradingAccountsService.ts` | `renameAccount` |
| `src/infrastructure/persistence/tradingAgentBrain.ts` | `recordCorrelation`, `brainStats`, `buildBrainContext` |
| `src/infrastructure/persistence/tradingLedgerService.ts` | `bestStrategyForPair` |
| `src/infrastructure/persistence/tradingRiskService.ts` | `loadRiskPresets`, `saveRiskPresets`, `applyPresetToAccount` |
| `src/infrastructure/persistence/unifiedMemoryService.ts` | `layerOf`, `loadUnifiedMemoryCounts` |
| `src/infrastructure/persistence/userSettingsService.ts` | `deleteSetting`, `loadAgentModelChoicesDurable` |
| `src/infrastructure/supabase/supabaseClient.ts` | `resetSupabaseClient` |
| `src/presentation/components/axe-core/sceneBackdrop.tsx` | `heeftPlaat`, `useIsGlassLook` |
| `src/presentation/components/axe-core/sphere/SphereXR.ts` | `checkXRSupport` |
| `src/presentation/components/axe-core/terrain/terrainEngine.ts` | `createNoise2D` |
| `src/presentation/components/surface/Surface.tsx` | `Chip`, `GhostButton` |
| `src/presentation/components/trading/StrategyDot.tsx` | `StrategyDots`, `TimeframeMarks` |
| `src/presentation/components/trading/companion/PositionLabelsOverlay.tsx` | `slTpDraftKeyForPosition`, `slTpDraftKeyForOrder` |
| `src/presentation/components/trading/companion/chartTheme.ts` | `readChartThemeKey`, `writeChartThemeKey`, `readGridStyle`, `writeGridStyle` |
| `src/presentation/components/trading/companion/indicatorMapping.ts` | `resolveIndicatorNames`, `describeResolvedLayers` |
| `src/presentation/components/trading/companion/indicatorMath.ts` | `stddevSeries` |
| `src/presentation/components/trading/companion/symbolFormat.ts` | `isForexPairSymbol`, `isEquityCfdSymbol`, `contractSizeForSymbol`, `pointValueForSymbol` |
| `src/presentation/components/trading/smcDetect.ts` | `detectFvgs`, `detectIfvgs`, `detectOrderBlocks`, `detectPdhPdl`, `detectFib` |
| `src/presentation/store/installWhisperVoice.ts` | `isVoiceConversationActive` |

### 2d. Onbepaald — geen aanroeper gevonden in broncode, maar staat wél in `dist/`

49 functies. Dit is precies de val uit AGENTS.md val 2: 'een grep op src/ bewijst niet
dat iets draait' — het omgekeerde geldt ook, en dit rapport probeert het niet om te draaien in een
blind vonnis. De naam staat in de gebouwde bundel, dus iets heeft hem tijdens het bouwen bereikt;
mijn eigen zoekopdracht vond alleen de aanroeper niet (mogelijk via het object-patroon hierboven, of
een naam die per ongeluk ook ergens anders in de bundel voorkomt). **Niet als dood behandelen —
handmatig nakijken.**

| Functie | Bestand | Regel |
|---|---|---|
| `classifyBranch` | `src/application/agents/langGraphOrchestrator.ts` | 45 |
| `orderSlotsForBranch` | `src/application/agents/langGraphOrchestrator.ts` | 58 |
| `directFromAssistantMessage` | `src/application/sphere/sphereDirector.ts` | 296 |
| `projectionFromAttachment` | `src/application/sphere/sphereDirector.ts` | 20 |
| `projectionFromResolved` | `src/application/sphere/sphereDirector.ts` | 74 |
| `loadDynamicNavItems` | `src/domain/navRegistry.ts` | 81 |
| `applyPrimarySlot` | `src/domain/providers.ts` | 197 |
| `limitChatIdentityCascade` | `src/domain/providers.ts` | 338 |
| `resolveOllamaModel` | `src/domain/providers.ts` | 222 |
| `firecrawlSearch` | `src/infrastructure/gateways/firecrawlService.ts` | 35 |
| `isGeminiLiveAvailable` | `src/infrastructure/gateways/geminiLiveService.ts` | 374 |
| `stopGeminiLive` | `src/infrastructure/gateways/geminiLiveService.ts` | 382 |
| `callWithFallbackDetailed` | `src/infrastructure/gateways/llmGateway.ts` | 165 |
| `getSmartThingsToken` | `src/infrastructure/gateways/smartThingsService.ts` | 12 |
| `setSmartThingsToken` | `src/infrastructure/gateways/smartThingsService.ts` | 25 |
| `getCapability` | `src/infrastructure/persistence/capabilityService.ts` | 201 |
| `invalidateCapabilityCache` | `src/infrastructure/persistence/capabilityService.ts` | 245 |
| `loadLocalCapabilities` | `src/infrastructure/persistence/capabilityService.ts` | 49 |
| `rememberSessionOpen` | `src/infrastructure/persistence/continuousMemoryService.ts` | 229 |
| `syncObsidianIntoGlobalBrain` | `src/infrastructure/persistence/globalBrainService.ts` | 54 |
| `getBestSpecialist` | `src/infrastructure/persistence/globalMemoryService.ts` | 231 |
| `initializeGlobalMemory` | `src/infrastructure/persistence/globalMemoryService.ts` | 246 |
| `loadMemoriesByCategory` | `src/infrastructure/persistence/globalMemoryService.ts` | 99 |
| `logSystemEvent` | `src/infrastructure/persistence/globalMemoryService.ts` | 263 |
| `recordAgentPerformance` | `src/infrastructure/persistence/globalMemoryService.ts` | 144 |
| `recordProviderPerformance` | `src/infrastructure/persistence/globalMemoryService.ts` | 183 |
| `recordSpecialistMatch` | `src/infrastructure/persistence/globalMemoryService.ts` | 216 |
| `flushMemoryNow` | `src/infrastructure/persistence/memoryRecorder.ts` | 187 |
| `pendingMemoryCount` | `src/infrastructure/persistence/memoryRecorder.ts` | 205 |
| `extractWikilinks` | `src/infrastructure/persistence/obsidianMemoryService.ts` | 44 |
| `noteToMarkdown` | `src/infrastructure/persistence/obsidianVaultSyncService.ts` | 51 |
| `pullNotesFromVault` | `src/infrastructure/persistence/obsidianVaultSyncService.ts` | 186 |
| `syncAllNotesToVault` | `src/infrastructure/persistence/obsidianVaultSyncService.ts` | 105 |
| `initializeRagMemory` | `src/infrastructure/persistence/ragMemoryService.ts` | 390 |
| `getRepoById` | `src/infrastructure/persistence/repoConfigService.ts` | 175 |
| `listSkillsGrouped` | `src/infrastructure/persistence/skillRegistryService.ts` | 125 |
| `loadCustomSkills` | `src/infrastructure/persistence/skillRegistryService.ts` | 22 |
| `loadSkillAssignments` | `src/infrastructure/persistence/skillRegistryService.ts` | 40 |
| `saveCustomSkills` | `src/infrastructure/persistence/skillRegistryService.ts` | 27 |
| `saveSkillAssignments` | `src/infrastructure/persistence/skillRegistryService.ts` | 53 |
| `isProtectedBranch` | `src/infrastructure/persistence/thinkTankGit.ts` | 28 |
| `resolveWriteBranch` | `src/infrastructure/persistence/thinkTankGit.ts` | 33 |
| `thinkTankBranchName` | `src/infrastructure/persistence/thinkTankGit.ts` | 18 |
| `addToWatchlist` | `src/infrastructure/persistence/tradingIntelService.ts` | 148 |
| `archiveIntelReport` | `src/infrastructure/persistence/tradingIntelService.ts` | 133 |
| `getIntelReport` | `src/infrastructure/persistence/tradingIntelService.ts` | 111 |
| `inferAssetClass` | `src/infrastructure/persistence/tradingIntelService.ts` | 178 |
| `removeFromWatchlist` | `src/infrastructure/persistence/tradingIntelService.ts` | 171 |
| `markLoadedAsPersisted` | `src/presentation/store/voiceStore.ts` | 1012 |

---

## 3. Dubbel in `axe-look.css`

2803 regels. De `--m-*`-kleurtokens die AGENTS.md noemt staan er inmiddels niet meer in — dat lijkt
dus al opgelost. Wat ik wél vond, met dezelfde vorm van het probleem: **dezelfde selector opnieuw
geopend, honderden regels verderop, met een andere waarde voor dezelfde eigenschap** — de tweede
wint stilzwijgend, dus een wijziging aan de eerste lijkt niets te doen. Precies het patroon dat
`railBreedte.test.ts` al voor één token bewaakt.

### Zelfde selector, meerdere keren geopend

| Selector | Regels |
|---|---|
| `:root[data-look] .axe-shell .axe-bottomnav` | 765, 875, 1288, 1386, 1411 |
| `:root[data-look] .axe-scene` | 1151, 1821, 1840, 2293 |
| `:root[data-look='glass']` | 203, 365, 509 |
| `:root[data-look] .axe-slot--rechts` | 1884, 1903, 2476 |
| `:root[data-look] .axe-paneel-kop` | 1972, 2550, 2602 |
| `:root[data-look]` | 27, 634 |
| `:root[data-look] .axe-shell .axe-surface--inset` | 379, 2226 |
| `:root[data-look] .axe-chatplaat` | 789, 1595 |
| `:root[data-look] .axe-chatplaat > [role='button']` | 818, 834 |
| `:root[data-look] .axe-composer` | 846, 1602 |
| `:root[data-look] .axe-bottomnav` | 1069, 2035 |
| `:root[data-look] .axe-paneel-acties button` | 2565, 2618 |
| `:root[data-look] .axe-preview` | 2706, 2723 |

### Zelfde eigenschap twee keer binnen dezelfde selector (de tweede overschrijft de eerste)

| Selector | Eigenschap | Regel → waarde | Regel → waarde |
|---|---|---|---|
| `:root[data-look] .axe-shell .axe-surface--inset` | `background` | 380 → `var(--surface-bg)` | 2231 → `var(--axe-chat) !important` |
| `:root[data-look] .axe-chatplaat` | `min-height` | 810 → `clamp(104px, 13vh, 168px)` | 1596 → `0` |
| `:root[data-look] .axe-chatplaat` | `max-height` | 811 → `32vh` | 1597 → `none` |
| `:root[data-look] .axe-bottomnav` | `background-color` | 1070 → `transparent !important` | 2038 → `transparent !important` |
| `:root[data-look] .axe-scene` | `border` | 1152 → `0 !important` | 1841 → `0 !important` |
| `:root[data-look] .axe-scene` | `border-radius` | 1153 → `0 !important` | 1842 → `0 !important` |
| `:root[data-look] .axe-scene` | `background-color` | 1154 → `transparent !important` | 1822 → `transparent !important` |
| `:root[data-look] .axe-shell .axe-bottomnav` | `width` | 1403 → `min(var(--axe-barw, 1520px), calc(100% - 2 * var(--axe-onder, 75px)))` | 1412 → `calc(100% - 16px)` |
| `:root[data-look] .axe-paneel-kop` | `margin` | 1973 → `0 0 10px` | 2604 → `0 0 10px` |

`plaatTint.test.ts` en `railBreedte.test.ts` vangen elk één token hiervan al af. De rest staat
nergens onder toezicht.

---

## 4. Losse variabelen (eslint)

AGENTS.md noemt 21 bestaande lintfouten als bekende bodem. `npx eslint src` liep in deze sessie
vast op de netwerkschijf (170s zonder resultaat) — ik heb dit dus niet zelf kunnen verifiëren of
aanvullen. Draai `npx eslint src` lokaal en vergelijk met die 21 voor je hier iets aan verandert.

---

## `src/domain/dodeCode.test.ts`

Bewaakt categorie 2c hierboven (en de bestanden uit hoofdstuk 1, want een export in een dood
bestand heeft per definitie ook geen aanroeper): een exportnaam die nergens anders in `src/`
voorkomt, ook niet in een test. De 295 vandaag gevonden gevallen staan op een naam+bestand
uitzonderingslijst in de test zelf. Voegt iemand morgen een nieuwe geëxporteerde functie toe
zonder hem ergens aan te roepen, dan faalt de test en noemt hij de nieuwe naam.

De test dekt niet categorie 1 (dode bestánden) los af — dat vereist de volledige import-graaf, te
kwetsbaar om in een snelle unit-test te herhalen. Hoofdstuk 1 hierboven is daarvoor de bron.
