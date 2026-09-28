# AXE CORE — bouwlijst

Bijgewerkt 24 september 2026. Alles hieronder is **gemeten**, niet aangenomen.
Staat er een aanname, dan staat erbij dat het er een is.

Lees eerst `AGENTS.md` in de hoofdmap. Werk je hieraan met Cursor of Cowork:
zet je naam bij het punt dat je oppakt, zodat we niet twee keer hetzelfde doen.

---

## Af, en gemeten

- **Providerkaarten** — 16 providers, één kaartvorm, groen/rood in de rand,
  echte foutreden in plaats van "Proxy HTTP 502". Instellingen en de
  rechterbalk lezen dezelfde catalogus (`domain/providerCatalogue.ts`).
- **Betekenis-kleuren** — `--m-*` bestond niet; 24 plekken waren kleurloos.
- **De VPS valt niet meer om** — swap + cgroup-grens op ollama. Bewezen onder
  belasting: 20 van 20 metingen bleef de API antwoorden.
- **De backend staat in git** — `main.py` en vijf andere draaiden ongetrackt.
  `vps_sync.py check` zegt nu "box and repo agree on every managed file".
- **LSE-route** — `api.axecompanion.com/market/lse` geeft 22.850 datasets met
  live ticks. *Nog niet gebruikt door trading; alleen een levenscontrole.*
- **Browser-tab** — de maatstaf voor elke andere tab. Zie `UI-MAATSTAF.md`.
- **De leerlus draait rond** — episodes worden geopend, gesloten en versterkt.

## 1 — Tabs kloppend maken

De browser-tab is de meetlat. De vijf layoutregels staan in `AGENTS.md` en
`UI-MAATSTAF.md`. Primitieven: `TabRuimte`, `Kaart`, `SectieBlok`, `SchuifBalk`
in `src/presentation/components/layout/tabMaatstaf.tsx`. Alleen stijl en
indeling — geen data, hooks, stores of API. Composer, chat, voice en AICore
blijven buiten dit spoor (eigen PR).

Volgorde, bewust: eerst de regel en de gedeelde vorm, dan Settings (Luka's
belangrijkste tab), dan MCP (het tegenvoorbeeld), dan de rest.

- [x] **1.0** Regel vastgelegd in `AGENTS.md`, `UI-MAATSTAF.md` en hier.
      Gedeelde primitieven + tokens (`--axe-kaart-*`, één definitie, test
      `kaartMateriaal.test.ts`) horen in dezelfde PR als 1.0a/1.0b.
      Aanvulling 24 september: elke tab heeft links én rechts dezelfde
      hover/click-lade. Rechts mag leeg zijn totdat een tab echte context heeft.
- [x] **1.0a** Settings: gegroepeerde matzwarte kaarten in sectieblokken,
      Browser-vormige schuifbalk (Providers / Voice / Trust / Routing /
      System / General), inhoud gecentreerd in `TabRuimte`.
- [x] **1.0b** MCP: compacte stat-kaarten (niet meer `STAT_ROW` die drie
      cijfers tot balken rekt), ruimere serverkaarten in `.axe-kaart-raster`,
      tool-tester in een Agents-sectieblok, zelfde schuifbalkvorm.
- [x] **1.0c** Calendar, Cron, Tasks: `TabRuimte` (Calendar/Cron/Tasks
      vullen), Tasks-schuifbalk Status, Cron-formulier als `Kaart`,
      TASKS/CRON JOBS als `SectieBlok`. Geen `LIST_GRID` meer op Cron.
- [ ] **1.0d** Resterende tabs dezelfde primitieven. Gedaan: Finance
      (`StatRij` + Source-schuifbalk), Control Plane + CrewAI (`StatRij`,
      geen `STAT_ROW`), Organization (`TabRuimte vullen`). Nog open:
      Agents, Apps, Knowledge, Terminal, Obsidian, Maps, EVE,
      Table editor, Command, Developer, Infrastructure, Memory,
      Home (alleen wat geen composer/AICore is).
- [ ] **1.1** Per tab langs `UI-MAATSTAF.md` — volgt uit 1.0c/1.0d.
- [ ] **1.2** Vier tabs gebruiken minder dan de helft van de hoogte:
      eve 32%, tasks 46%, cron-manager 47%, mcp 50%. MCP hoort na 1.0b
      inhoud-bepaald te zijn (niet opgerekt); hermeten na pull.

## 2 — Agents

### Twee vormen, één lus

De koppeling staat er. Beurten blijven in localStorage (kort, per apparaat);
episodes gaan naar Supabase (duurzaam, voor de versterking). `noteRetrieval`
opent beide; `noteTurnOutcome` / `noteOwnerOutcome` sluiten beide.

```
noteRetrieval(query,  memoryIds, memoryKeys, owner)  → turnId  (localStorage)
openEpisode({subject, memoryIds, memoryKeys, agent}) → id      (Supabase)
```

- [x] **2.0** `noteRetrieval` opent óók een episode; het oordeel sluit hem.
      `'local-code'` valt onder `'code-editor'`. Offline (`openEpisode` →
      null of een throw) laat de beurt in localStorage gewoon werken.

  De brug bestond al (commit `72f8e6ea`) maar de lus kwam niet rond.
  Gemeten 23 september op AXE Companion:

  | agent | geopend | gesloten |
  |---|---|---|
  | trading | 5024 | 72 |
  | chat | **2** | **0** |
  | browser, code-editor, research | 0 | 0 |

  Beide chat-rijen hadden herinneringen, `verdict = unknown`, `closed_at`
  null. Oorzaak: `openEpisode` is async en voiceStore geeft geheugen 500ms;
  het oordeel kwam eerder dan het episode-id (of eerder dan de beurt zelf)
  en verdween. Zonder sluiten leest `applyAgentReinforcement` ze nooit.

  Tests die falen op de oude code: oordeel vóór episode-id, oordeel vóór
  ophalen, `openEpisode` null/throw, lege RAG opent wél een `chat`-rij,
  voiceStore roept `noteOwnerOutcome` aan (`beurtNaarEpisode.test.ts`,
  `learningLoopWiring.test.ts`).

  **Live nabouwen, in de draaiende app:**
  ```sql
  select agent, count(*) filter (where closed_at is not null) as closed,
         count(*) as opened
  from agent_learning_episodes
  group by agent;
  ```
  Na één chatbericht hoort `chat.opened` omhoog te gaan, en na het antwoord
  `chat.closed` ook. Hier geen composer-sessie, dus dat laatste is niet
  live gemeten.


- [ ] **2.1** **De agents-tab toont dubbelen.** 18 agents in `core_agents`,
      maar de tab telt er 29 ("defaults + core_agents"). AXE Core, AXE Intel en
      AXE Companion staan er twee keer. Eén bron kiezen.
- [ ] **2.2** Drie agents hebben status `statue` — geen geldige waarde.
      Uitzoeken of dat `static` moest zijn.
- [ ] **2.3** Per agent tonen: welke skills, welke tools, welk model, en of
      zijn leerlus rondloopt (`agent_learning_episodes` per agent).
- [ ] **2.4** RAG-bestanden per agent zichtbaar maken.
- [ ] **2.5** Alle agents de lus geven. Nu: chat, browser, code-editor,
      lokale code en trading. Nog niet: `agenticEngine`, `langGraphOrchestrator`.

## 3 — Trading

### ✅ Rechtgezet: verkeerde datum, verkeerd aantal — maar de burst bestaat

Hier stond: op 8 september tussen 19:15:59 en 19:16:13 gingen er **18
XAUUSD-orders** naar MT5 100K DEMO. Gemeten op 9 september, rechtstreeks op de
database, klopt daar bijna niets van — en tegelijk is het onderliggende
probleem echt. Allebei belangrijk.

**De 8-septemberavond was een inleesronde, geen burst.** Op 17:15–17:16 UTC
(19:15–19:16 bij ons; in de eerdere lezing zat óók een uur verschil) zijn er 38
rijen in `core_trading_trades` geschreven, en alle 38 hebben
`exit_reason = broker_close`, `status = closed` met pnl erbij, geen
`local_trade_id`, en een `opened_at` tussen **21 augustus en 4 september**. Het
zijn afgesloten broker-trades die die avond in één keer in het journaal zijn
gezet.

**De denkfout is één kolom.** `created_at` is wanneer de RIJ geschreven werd,
`opened_at` wanneer de order geplaatst werd. Bij ingelezen trades staan die
weken uit elkaar. Alles wat "18 orders in 14 seconden" leek is de snelheid van
het invoegen; de verschillende instapprijzen zijn goudprijzen van twee weken,
op volgorde van invoegen — niet een koersvoeding die ±30 per seconde bewoog.
De 7 rijen zonder strategie, framework of reden waren het duidelijkste signaal:
dat zijn precies de trades die AXE níét bedacht heeft, dus er valt niets in te
vullen.

Tegencheck: op 8 september opende de broker in totaal **8** XAUUSD-trades,
verspreid over de hele dag, nooit meer dan één per minuut.

**Maar op `opened_at` staat een echte burst, en die is erger.**
21 augustus 16:20:34, MT5 100K DEMO: **zeven AUDUSD-orders binnen 11
milliseconden**, allemaal `mean-reversion` op m15, met net iets verschillende
prijzen. Niet veertien seconden — elf duizendsten. Dat is geen reeks
beslissingen maar één beslissing die zeven keer vertrekt.

Meer clustering op `opened_at`, per account binnen 60 seconden:

| dag | account | paar | keren |
|---|---|---|---|
| 21 aug | MT5 100K DEMO | AUDUSD | 6 |
| 25 aug | MT5 100K DEMO | XAUUSD | 1 |
| 26 aug | MT5 100K DEMO | XAUUSD | 4 |
| 27 aug | MT5 100K DEMO | XAUUSD | 2 |
| 27 aug | MT5 50K DEMO (run-2) | XAUUSD | 1 |

**Na 27 augustus geen enkele meer.** Dat is vóór de reparaties van vandaag, dus
die kunnen er niet de oorzaak van zijn — waarom het stopte is niet gemeten.

De reparaties hieronder pakken dus wél een echt verschijnsel aan, alleen niet
op de dag die hier stond. Het 11-milliseconden-geval is precies waar de
in-proces teller voor is: zeven plaatsingen die allemaal dezelfde
teller-van-vóór lezen omdat er nog niets in de historie staat.

- [x] **3.0 — de rem** De dagteller leest nu de BROKER, niet de papieren
      spiegel. `brokerOpeningsTodayFor()` in `brokerConnector.ts` telt de echte
      opening-deals (`DEAL_ENTRY_IN`/`INOUT`) van vandaag per account; een
      onleesbare broker geeft `null` → de cyclus HOUDT vast (`dayCountUnverified`)
      in plaats van blind te traden, en dat blokkeert alleen een OPEN, nooit een
      exit. Daaronder telt een in-proces teller elke plaatsing mee op het moment
      dat hij vertrekt. `dayLimitState()` bundelt de regel puur en getest
      (`dayLimit.test.ts`).
- [x] **3.0 — een dubbel-order-lek** `addAccount()` controleerde niet op een
      bestaande `accountId`, dus dezelfde MT5-account kon twee keer in de lijst
      staan; `selectTradeable()` dedupt nu op accountId
      (`tradeableAccounts.test.ts`).
- [x] **3.0 — de open vraag is beantwoord** De 8-septemberburst bestond niet
      (inleesronde). De echte zit op 21 augustus 16:20:34: zeven AUDUSD-orders
      in 11 ms op één account, één strategie. Dat is één beslissing die zeven
      keer vertrekt, niet zeven beslissingen — en dat is wat de in-proces teller
      afvangt.
- [ ] **3.0c — waarom stopte het op 27 augustus?** Sinds 27 aug staat er geen
      enkele clustering meer op `opened_at`, en dat is weken vóór de reparaties.
      Er is dus iets anders veranderd. Niet gemeten, en zolang je dat niet weet
      weet je ook niet of het terug kan komen.
- [x] **3.0b — de inleesronde verliest de openingstijd** De reconciler had
      `t.openTime` in handen en gaf hem niet door, dus viel de invoeging terug op
      de sluittijd: alle 43 ingelezen rijen stonden als trade van nul seconden in
      het journaal. `recordTradeClosed` neemt nu `openedAt`
      (`tradeOpenTime.test.ts`, faalt op de oude code). **De 43 bestaande rijen
      blijven fout** — hun echte openingstijd staat alleen nog bij de broker, en
      opnieuw inlezen zou dubbele rijen geven.

- [x] **3.1 — de cyclus betaalt niet meer voor het onmogelijke** Gemeten op het
      journaal van 9 sept (8 cycli, 5 accounts): 21 van de 40 account-uitkomsten
      was een overslaan (52%), 14 een fout, **0 een order**. Op US30, NAS100 en
      US2000 sloegen steeds 4 van de 5 over. En dat gebeurde PAS NA research,
      desk lanes en trechter — die draaien per symbool, vóór de uitwaaiering.
      `scanUniverse` sorteert nu op dekking (breedst eerst, nul-dekking eruit) en
      `runOneSymbol` stopt vóór de research als geen enkel account het symbool
      voert, met de reden in het journaal. Regel puur in `scanCoverage.ts`,
      8 tests.
- [x] **3.1b — vervallen door 3.1d** De klacht was: van ETHUSD, NAS100, US30,
      DJ30, BTCUSD en XAUUSD wordt alleen goud door alle accounts gevoerd. Dat
      klopt nog steeds, maar het is geen probleem meer: sinds 3.1d wordt een
      symbool geprijsd door het account dat het wél voert, dus NAS100 en US30
      handelen gewoon bij OANDA. Ik laat de watchlist met rust — het is Luka's
      lijst, en de reden om er iets uit te halen is weg.
- [x] **3.1c — de indices sloopten de prijs van goud** Het waren geen twee
      problemen maar één. `tryMetaApiSnapshot` haalt ÉÉN config op — het
      standaardaccount — voor ELK symbool, en de scanlijst staat vol indices en
      crypto die een MT5-demo niet voert. Elke ronde een reeks NotFoundErrors;
      MetaAPI telt die en knijpt de hele **subscriptie** af. Dat is de 429 die
      hier vijf keer als snelheidslimiet is gelezen. Daarna valt XAUUSD door naar
      Binance en weigert `assertTradeable` terecht. Nu vertrekt er geen
      kandelaanvraag meer voor een symbool dat het account niet voert
      (`marketDataAccountFit.test.ts`, faalt op de oude code).
- [x] **3.1d — een symbool bij het JUISTE account halen** `marketDataService`
      kiest de rekening per symbool: eerst het standaardaccount, anders het
      eerste verbonden account dat het paar voert, anders niemand. Een uur
      onthouden, zodat de catalogus niet per aanvraag gelopen wordt.
      `metaApiGetHistoricalCandles` neemt daarvoor een optionele `account`;
      weglaten is exact het oude gedrag (`marketDataAccountFit.test.ts`).
- [ ] **3.1e — meten of het werkt** De keten is beredeneerd en getest, niet
      gemeten. Het bewijs is een cyclus die wél een order plaatst.

      **Nulmeting, vlak vóór de fix ging draaien** (journaal t/m de cyclus van
      9 sep 20:32 UTC, 40 account-uitkomsten):

      | | |
      |---|---|
      | overgeslagen | 21 |
      | fout | 14 — waarvan 6 quota, 8 synthetisch |
      | orders | **0** |

      De app draait sinds 10 sep 09:20 met de fix. Het journaal rolt door, dus
      deze cijfers staan hier en niet alleen in de database. Herhaal de telling
      met de query in de sessienotities; gaan quota en synthetisch naar nul en
      staat er een order, dan is het bewezen.
- [x] **3.2 — risico per account instelbaar** De opslag kon dit al
      (`tradingRiskService.keyFor(accountId)`, met overerving van de
      bureau-standaard) en de engine las het al per account. Alleen dit scherm
      kende de vraag niet, dus stond er in de praktijk één profiel voor alles.
      De Risk-kaart heeft nu een kiezer bovenaan: **Bureau (standaard)** plus
      elk ingeschakeld account. Per account zet een modusknop alleen de MODUS en
      laat de rest staan — een preset die de zorgvuldig ingestelde drawdown van
      een prop-account terugzet is precies wat je daar niet wilt.
- [x] **3.3 — LSE is aangesloten als koersbron** `lseCandles` en `lseCatalog`
      stonden op de dode-code-lijst: alleen de probe voor de connect-kaart werd
      gebruikt. Nu zit LSE in de prijscascade, vóór Binance. Dat is de winst:
      Binance levert voor alles behalve crypto het VERKEERDE instrument (zijn
      AUDUSDT is niet de AUDUSD van de broker), terwijl LSE wél XAU/USD,
      EUR/USD, NAS100/USD en US30/USD heeft.
      **Gemeten in de draaiende app**, balken van 18 minuten oud: goud 4406,15 ·
      NAS100 29411,4 · US30 52547,3 · EURUSD 1,1637 · BTCUSD 78086.
      Twee dingen die alleen door het te draaien bleken: LSE negeert de gevraagde
      resolutie en levert **altijd minuten** (vandaar `candleAggregation.ts`), en
      zonder venster geeft hij de **oudste** data — de eerste rij van XAU/USD is
      van 2006. Ook `limit` kapt aan het begin van het venster, niet aan het eind;
      de eerste versie gaf daardoor balken van twee dagen oud zonder dat er iets
      faalde.
      **Niet om op te handelen**: `assertTradeable` blijft de prijs van de
      rekening eisen die de order vult. LSE is voor de grafiek, backtests en
      context — `source: 'lse'`, zodat de bewaker hem herkent en weigert.
- [x] **3.3c — execution vraagt geen fill op LSE/Binance** Gemeten in tests
      (niet live): `fetchTradeableSnapshot` loopt niet meer door de
      grafiek-cascade. Als MetaAPI zwijgt wordt LSE niet aangeroepen, de
      cyclus stopt vóór research (`magDureCyclus` / `probeerBrokerPrijs`),
      en `brokerPlaceOrder` weigert met `venue: 'price'`. DJ30 telt als
      US30 (register-alias, bewezen); GER40→DE30 niet. **3.1e blijft open**
      — een live cyclus met een order is nog niet gemeten.
- [ ] **3.3b — hernoemde symbolen** `GER40` heet bij LSE `DE30/EUR`. De
      vertaling zoekt in de catalogus en raadt geen hernoemingen, dus die geeft
      niets terug. Een tabel kan dat oplossen, maar alleen op bewijs per stuk —
      een plausibele gok geeft een grafiek van het verkeerde instrument, en dat
      zie je niet aan de vorm.
- [x] **3.4 — de aanname klopte niet, het echte probleem lag ernaast** Gemeten
      10 september. "Kronos" bestaat niet meer; de VPS meldt `vbt`, `nt` en `ta`,
      allemaal installed. En ze zijn wél te kiezen: het ledger heeft **101
      `vbt:`-regels en 163 `nt:`-regels**. (Ik dacht eerst van niet omdat de
      ledger-weergave op ≥1 trade filtert en voorkennis nul trades heeft.)
      Vanuit de app antwoorden beide engines met vier strategieën elk:
      `vbt:ma-cross`, `rsi-meanrev`, `bbands`, `macd` en `nt:ema-bracket`,
      `atr-breakout`, `donchian-trail`, `rsi-pullback`.

      **Wat er wél mis was:** het ledger kreeg sinds 8 september geen enkele
      nieuwe regel, terwijl de zelftest vanmorgen om 07:17 gedraaid heeft. Hij
      stempelt zijn slot vóór de sweep — terecht, want een zware ronde mag niet
      meteen opnieuw — maar een ronde die NIETS oplevert zette zichzelf zo twaalf
      uur op slot. Van buiten niet te onderscheiden van "er viel niets te leren".
      `selfTestPairs` telt nu wat er landt, en een lege ronde probeert het na een
      uur opnieuw (`selfTestGate.ts`, 4 tests).
- [ ] **3.4b — TradingAgents levert niets** `ta:` staat nul keer in het ledger.
      `/backtest/tradingagents` gaf binnen 45 seconden geen antwoord (hij draait
      op de lokale Ollama van de VPS, dus traag is verwacht — leeg niet). Zolang
      dit zo blijft is TradingAgents wel geïnstalleerd maar doet het niets.

## 4 — Computer use, browser, code-editor

- [x] **4.1** **Computer use is aangesloten.** Het gat was groter dan hier
      stond: `COMPUTER_TOOL_RUNTIMES` had nul gebruikers én `MAC_TOOL_RUNTIMES`
      stond wel geimporteerd in `toolRegistry.ts` maar werd nooit uitgerold —
      terwijl de catalogi hun gereedschappen wél aanmeldden. AXE zág ze dus en
      kon ze aanroepen zonder dat er iets achter zat. Beide nu uitgerold, met
      `toolRegistryBedrading.test.ts` erop (faalt op de oude registry op precies
      die twee). Er staat een werker ingecheckt op de iMac, dus het werkt echt.
      In de composer zit nu een knop met de stand erbij: groen of rood, en bij
      rood wat je eraan doet (`VermogensKnop.tsx`, `vermogenStand.test.ts`).
- [ ] **4.2** Browser buiten de app — het losse venster bestaat, ongetest.
- [ ] **4.3** Code-editor op het niveau van Cursor. *Groot; eerst opsplitsen.*

## 5 — Luka kan het zelf

- [x] **5.1** `SLEUTELS.md` — waar elke sleutel woont.
- [x] **5.2** `AGENTS.md` — waar elke assistent begint.
- [ ] **5.3** `axe-status` bij elke rode regel zeggen wát je eraan doet.
- [ ] **5.4** Strato: waarom valt de VPS uit? Op 7 sep was het ollama; op 9 sep
      viel hij hard weg (geen ping, poorten dicht) — dat is iets anders.

---

## 6 — AXE als baas (Jarvis-route, niet letterlijk Jarvis)

Aangepast van de Jarvis OS 2.0 / Jev-slides naar wat AXE Core al is: de
baas-chat naast de composer, de bestaande agents (War Room / Wingman,
NorthSea Desk, Trading / AXE Algo, Developer, …), de leerlus (#172),
RAG per taak, George (#173), first-token (#175), Whisper (#178) en de
LLM-cascade. Geen Obsidian-plicht, geen Claude Code-plicht. Twee deuren
(Home/HUD + dashboard) delen één brein.

Dit is **niet** de roster-tier in `roster.ts` (manager / worker /
assistant). Dit is de aanvraag-route.

### Fase 1 — tier-router (deze PR)

- [x] **6.1** Elke beurt door een classifier die tier 1/2/3 teruggeeft,
      plus agent/skill bij tier 3, in ruim onder 1s. Regels eerst;
      optioneel Groq `llama-3.1-8b-instant` bij twijfel; timeout 700ms
      → huidig pad.
- [x] **6.2** Tier 1 antwoordt zonder groot model: groet (`hey axe`),
      status, taken / prioriteiten / agenda uit opgeslagen data.
- [x] **6.3** Tier 2 = klein snel model, lichte context, gestreamd.
- [x] **6.4** Tier 3 erkent meteen, zet een durable task bij de bestaande
      agent, schrijft het resultaat in de leerlus/RAG.
- [x] **6.5** Cognitive stream toont `route · tier N · … · Nms`.
      Latency staat op het `RoutingEvent`.
- [x] **6.5a** Multi-intent: één zin met meerdere taken wordt geknipt
      (NL + EN), elk stuk een eigen job, parallel, één korte ack.
      De chat blijft open voor nieuwe T1/T2-beurten.
- [x] **6.5b** Agents-balk boven de composer (`N agents running`),
      matzwart met dunne lijn; klik opent naam / agent / stand.
- [x] **6.5c** Klaar job komt als korte samenvatting in de chat.
      George TTS wacht als de gebruiker praat (spraakrij + barge-in).
      `Wat heb je gedaan?` / `status` is T1 uit de job-store.
- [x] **6.5d** Zin-voor-zin TTS tijdens de LLM-stream: eerste complete
      zin speelt terwijl de rest nog komt. Per-beurt `lat · stt · route
      · token · audio` in de cognitive stream.
- [x] **6.5e** Orb volgt mic (listening) en TTS-analyser (speaking).
      Settings-schakelaar: George (standaard), Cedar, ElevenLabs Flash
      v2.5, ElevenLabs v3 Conversational, Cartesia Sonic, Fish.
      Sleutels alleen via Settings → Keys / `VITE_*` — geen waarden
      in de repo.

**Al aanwezig vóór deze PR:** `classifyQuery` / `classifyChatIntent` /
`isSocialChatTurn` / `routeFast` / `delegateFor`, durable tasks + monitor
in `installStableChat`, first-token stream, leerlus (`noteRetrieval` →
`noteOwnerOutcome`), Groq-slot, Whisper-lus + barge-in (#178).

**Nog niet:** gemeten latency op de Mac (regels zijn in tests <5ms;
het model-pad is begrensd op 700ms). NorthSea auto-send blijft uit.

### Fase 2 — gestructureerd geheugen

- [ ] **6.6** Vaste mappen: inbox / projects / content / wiki. Dagelijks
      briefje met plan, top 3, agenda. Elke taak laat een rapport achter.
      Harvest: een klaar project wordt een wiki-artikel.

**Al aanwezig:** RAG (`searchRagMemories`), leerlus + episodes, namespaces
(`axe_trader`, `global`, …), `writeConversationMemory`, Obsidian-tab,
continuous memory. **Ontbreekt:** de vaste structuur, het dagelijkse
briefje, rapport-per-taak, harvest.

### Fase 3 — skills als knoppen

- [ ] **6.7** Plan Today, Inbox Brief, Intel Brief, Deep Research, Weekly
      Review: dezelfde knoppen op Home/HUD en het dashboard, elk een
      nagekeken skill, ook via stem.

**Al aanwezig:** `skillRegistryService` / Architecture-skills, War Room,
delegate-signalen. **Ontbreekt:** die vijf knoppen als één bron, stem-
aanroepbaar, gekoppeld aan de router.

### Fase 4 — stem-UX

- [ ] **6.8** Spreken, pauze = versturen, Esc = stop, globale hotkey,
      een bol die altijd idle / listening / working / speaking / error
      toont.

**Al aanwezig:** Whisper-lus, George (Kokoro), `voiceStatus`, Home-bol
die meeloopt met die status, `statusOrb.ts` (idle/listening/thinking/
speaking/error), #178 stilte-wacht, Esc stopt de stemlus, barge-in
kapt TTS af, job-spraak wacht in de rij, zin-voor-zin TTS, orb op
mic + TTS-niveau, stem-motor in Settings. **Ontbreekt:** globale
hotkey om de mic van overal te openen.

### Fase 5 — OS3-gevoel: praten terwijl het werk doorloopt (25 sep)

- [x] **6.9** Achtergrondtaken uit het gesprek worden echt uitgevoerd.
      Bewijs: nul tier-3-taken ooit (core_tasks, 25 sep); Gemini gaf 402,
      'code'/'trading'/'research' hadden geen handler. Nu alles `agentic`,
      agent-lus op Groq → OpenAI → Gemini → ollama. Smoketest op de VPS:
      klaar en bewezen in 2 stappen, samenvatting is het antwoord zelf.
- [x] **6.10** Leestaken zijn echt dicht: `execution_mode=read` blokkeert
      schrijven en posten; mail/versturen vraagt altijd je ok. Smoketest:
      schrijfopdracht in een leestaak schreef niets.
- [x] **6.11** Beurtplan: één snel model leest de hele beurt (brain dump) en
      scheidt opdrachten, dingen om te onthouden, herinneringen en praten.
      Getest op echte Nederlandse zinnen met gpt-4.1-mini (Groq's gratis
      dagtegoed was op). Geen plan binnen 3s = oude regelroute.
- [x] **6.12** Een taak die op je ok wacht, meldt zich één keer in het gesprek.
- [x] **6.13** Kern van de sphere spreekt mee met AXE (zelfde signaal als de
      composer-pulse).
- [x] **6.14** Agent-vensters rond de core op Home (screenshot shell-preview).
- [x] **6.15** Machinekeuze (Rabbit OS3: de cloud denkt, de apparaten doen).
      De agent-lus op de VPS heeft `list_devices` + `run_on_device`
      (`backend/axe_api/device_actions.py`): een actie wordt een
      `computer_use`-rij met `target_device`, die alleen de worker op díe Mac
      pakt. Tiers gelijk aan `riskTiers.ts` (test bewaakt dat); klikken/typen
      vraagt één ok per Mac+gereedschap, ingrijpend elke keer, leestaak weigert.
      Bewezen 25 sep: "welke app staat vooraan op de Mac mini en de iMac" →
      beide Macs gevraagd, juist antwoord, 3 stappen. iMac mist nog
      Toegankelijkheid + Schermopname (Luka zet die zelf aan).
      Worker vergelijkt nu met zijn start-build, niet live HEAD (autosync).
- [x] **6.17** Praten blijft praten (25 sep). Een gewoon spraakgesprek werd 25
      "browser"-taken: het plan viel over zijn 3s-limiet en de terugval knipte
      op komma's. Nu: plan-modellen tegelijk (eerste geldige wint, 6s), geen
      plan = gewoon terugpraten (en eerlijk zeggen dat niets gestart is), alleen
      een korte losse opdracht mag zonder plan één taak worden. Prompt: reageer
      als een mens, geen help-desk-opvulling; stemmingen/verhalen niet onthouden.
      Gemeten (gpt-4.1-mini): verhaal/stoom afblazen → 0 taken, ~1,1s;
      gemengde beurt → 1 taak + 1 herinnering + 1 idee, 1,9s.
- [x] **6.18** AXE onthoudt en gebruikt het (25 sep). Alles werd al opgeslagen
      (rag_memories ~400/dag), maar het snelle gesprekspad las niets terug
      (RAG-budget 0 ms). Nu `application/memory/gespreksGeheugen.ts`: profiel +
      recente herinneringen altijd warm (0 ms), zoeken op de beurt met 600 ms
      grens (400 ms voor snelle antwoorden); blok gaat in plan én tier 2.
      Plan onthoudt alles wat later telt (ideeën, mensen, feiten), niet opvulling.
      Gemeten: "wat wilde ik opschonen?" → "de trading desk, toch?", 1,2s.
- [x] **6.19** Eén gesprek op alle apparaten (OS3). Berichten dragen
      `metadata.device`; `installGesprekSync` kijkt elke 4s wat andere apparaten
      opsloegen: erbij in dit gesprek, of meeverhuizen naar het gesprek waar Luka
      elders mee verderging (alleen als AXE hier stil is). Gesprek laadt de
      nieuwste 500 i.p.v. de oudste; Supabase-terugval filterde op de verkeerde
      user_id en gaf altijd niets.
- [ ] **6.16** Echt getest in de app met stem: een brain dump van een paar
      minuten, onderbreken, resultaten die terugkomen. Nog niet gedaan.

---

## Hoe je een punt afvinkt

Niet omdat de code er staat. Alleen met bewijs dat losstaat van je eigen
redenering: een test die faalt zonder je wijziging, een meting, een screenshot.

Blijkt een punt niet te kloppen, verbeter dan de tekst hier in plaats van er
stilletjes iets anders van te maken.

---

## 7 — axe-commandolaag (CLI + hek, geen tweede agent)

De CLI en het hek zitten **bovenop wat er al is**. Geen nieuwe
node-daemon, geen nieuwe geheugenstore. Rabbit OS3 is een optionele
extra executor via dezelfde `cli/axe`.

- [x] **7.1** `axe` CLI (Python 3, geen extra packages) + geteste parser,
      guardrails en JSON-uitvoer (`src/cli/*.test.ts`, `cli/test_axe_laag.py`).
- [x] **7.2** Commando's mappen op wat er al is: taken, geheugen/RAG,
      agents/durable kernel, NorthSea (read-only), trading cockpit, cron, MCP,
      `axe node list` → bestaande `core_computer_workers`.
- [x] **7.3** Hek: alleen-lezen tot `--write`; hard geblokkeerd: mail,
      NorthSea `auto_send_*`, merge naar `orchestrator`, wissen.
- [x] **7.4** `os3/SKILL.md` + `os3/SETUP.md`.
- [ ] **7.5** Gemeten op de Mac mini en de VPS: `axe status --json` en de
      vijf testprompts uit SETUP.md. Hier niet live gemeten.
- [ ] **7.6** `cli_laag.py` op de box (`vps_sync.py check` na deploy).
- [ ] **7.7** AXON-read in chat — **niet** een vierde store. Write-bridge
      bestaat (`axonMemoryBridge.ts`); CLI-label `axon` is een stub op RAG.
      Alleen doen als je de bestaande `axonContextPack` in
      `buildDurableMemoryContext` hangt.

---

## 8 — Inventaris: bestaat / deels / ontbreekt

Niet bouwen wat hier **bestaat**. Uitbreiden waar het **deels** is.
Alleen het **ontbrekende** is werk — en dat is niet "een node-agent" of
"een memory backend".

Status is gemeten aan **aanroepers**, niet aan definities (val 2).

### Uitvoering / machines

| Stuk | Status | Waar (aanroeper) | Tabellen | Niet doen |
|---|---|---|---|---|
| Computer-use worker | **bestaat** | `infra/computer-worker/worker.mjs` ← Computer Use-tab, `toolRegistry.computer.ts`, launchd `com.axe.computer-worker` | `core_computer_workers`, `core_tasks` (`computer_use`, `target_device`), `core_task_events`, `core_trust_levels` | Geen tweede daemon, geen `core_nodes` |
| Claude-local / Mac-relay | **deels** | `infra/claude-local-worker/worker.mjs` ← `macRelayService.ts`, `[MAC:]`, voice; **geen launchd** | `core_tasks` (`claude_local`) | Geen `target_device`; niet vervangen door `axe node run` |
| Durable task kernel | **bestaat** | `task_runtime.py` / `task_worker.py` ← `/tasks*`, CLI `agent run`, ControlPlane, planner | `core_tasks`, `core_task_steps`, `core_approvals`, `core_task_events` | Geen parallelle job-queue |
| Device Manager (PR #149) | **deels** | `MobileSystem.tsx`, `device-manager/*`; native Android buiten repo | via `core_tasks` + loopback ADB `:4599` | Geen Samsung-side worker in deze repo |
| Browser-agent | **bestaat** | `browser_agent_app.py`, `com.axe.browser-agent` | — (in-process) | Niet via `core_tasks` |
| Terminal / mac-tunnel | **deels** | `terminal-server.cjs` (lokaal), `infra/axe-mac-tunnel` (handmatig) | — | Tunnel is outbound WebSocket, geen node-agent |
| LiveKit `core_devices` | **deels** | `livekitService.ts` | `core_devices`, `core_voice_*` | **Andere tabel** dan workers; niet hergebruiken voor executie |
| `axe node list` | **bestaat** (deze PR) | `GET /cli/nodes` leest `core_computer_workers` (45s, zelfde als `onlineDevices()`) | zelfde | Geen register/run/pairing |
| Nieuwe `axe node` daemon | **ontbreekt — bewust** | — | — | Niet bouwen; computer-worker ís de outbound executor |
| Pairing-token / `core_node_secrets` | **ontbreekt — bewust** | — | — | Workers auth'en al via service role / API-key |

### Geheugen / leerlus / agents

| Stuk | Status | Waar (aanroeper) | Tabellen | Niet doen |
|---|---|---|---|---|
| Leerlus PR #172 | **bestaat** | `noteRetrieval` / `noteOwnerOutcome` ← chat, voice, browser, code-editor; `axeBootstrap` 15 min | `agent_learning_episodes` + localStorage beurten | Geen tweede reinforcement |
| RAG semantisch | **bestaat** | `searchRagMemories` ← `searchGlobalBrain` ← `buildGlobalMemoryContext` (chat, agents) | `rag_memories`, RPC `match_rag_memories` | Geen tweede vectorstore |
| `global_memory` | **bestaat** | `memoryRecorder`, `/memory/upsert`, workers | `global_memory` | CLI-audit mag hierin, geen nieuwe event-log |
| Agent-namespaces | **bestaat** | `agentMemoryService` + `catalog.ts` `namespace` | `memory` | — |
| RAG per taak / bestanden per taak | **ontbreekt** | worker schrijft `global_memory` key `task_agent:{id}` | geen task-scoped RAG | Alleen bouwen als Luka dat apart vraagt |
| CLI `axe memory` | **bestaat** (deze PR) | `/cli/memory/search\|add` → RAG + global; ILIKE, niet pgvector | zelfde | Geen AXON-transport tot read-pad bestaat |
| AXON-product | **bestaat** (extern) | `axonMemoryBridge.ts` write vanuit trading | AXON-Supabase | Geen vierde store in AXE |
| AXON-read in chat | **ontbreekt** | `axonContextPack` alleen in tests | — | Hang in `buildDurableMemoryContext`, niet een nieuwe backend |
| Roster + dispatch | **bestaat** | `roster.ts` → voice; CLI → `/cli/agents/{id}/run` → `core_tasks` | `core_agents` (UI), roster (code) | 18 DB-rijen vs 13 roster — niet hier oplossen |
| Loop-wiring research/northsea/developer | **ontbreekt** | in `LOOP_AGENTS` maar geen `openEpisode`-aanroeper | — | Geen CLI-werk |
| `agenticEngine.ts` | **dood** | geen importeurs; echte runs via Python `task_worker.py` | — | Niet "aansluiten" zonder meting |

### Wat deze PR wél is

CLI + hek + `axe node list` als leesbril op de bestaande worker-tabel.
OS3-skill als optionele extra. Verder niets.
