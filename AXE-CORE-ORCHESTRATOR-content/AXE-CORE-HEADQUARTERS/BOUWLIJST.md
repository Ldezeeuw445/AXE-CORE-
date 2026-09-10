# AXE CORE — bouwlijst

Bijgewerkt 9 september 2026. Alles hieronder is **gemeten**, niet aangenomen.
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

De browser-tab is de meetlat. Elke andere tab moet daaraan voldoen.

- [ ] **1.1** Per tab langs `UI-MAATSTAF.md`. Nog niet gedaan voor: Agents,
      Apps, Knowledge, Control Plane, Calendar, Cron, Organization, Terminal,
      Obsidian, Maps, EVE, CrewAI, Table editor, Command, Developer.
- [ ] **1.2** Vier tabs gebruiken minder dan de helft van de hoogte:
      eve 32%, tasks 46%, cron-manager 47%, mcp 50%.

## 2 — Agents

### ⚠ Eerst dit: er zijn twee leerlussen, en maar één telt mee

Gemeten 9 september op `agent_learning_episodes`:

| | waar het staat | voedt de versterking |
|---|---|---|
| **trading** | Supabase, 1099 episodes | **ja** |
| chat, browser, code-editor, lokale code | `localStorage`, per apparaat | **nee** |

De andere agents leggen hun beurten wél vast — ze zijn niet stuk. Maar dat
gebeurt in `axe_memory_feedback_v1` in de browseropslag, en
`applyAgentReinforcement` leest alleen uit Supabase. Die beurten worden dus
opgeschreven en er gebeurt nooit iets mee. Op een tweede computer beginnen ze
bovendien weer bij nul.

**AXE Core leert dus alleen van trading.** Van elk gesprek, elke browsertaak en
elke code-bewerking wordt netjes bijgehouden wat eruit kwam, en dat verdampt.

**De reparatie is een koppeling, geen herbouw.** De twee vormen passen op
elkaar:

```
noteRetrieval(query,  memoryIds, memoryKeys, owner)  → turnId  (localStorage)
openEpisode({subject, memoryIds, memoryKeys, agent}) → id      (Supabase)
```

- [ ] **2.0** `noteRetrieval` opent óók een episode; `noteTurnOutcome` sluit
      hem. Dan is er één lus en werkt de versterking voor iedereen.

  Drie dingen om op te letten:
  1. `noteRetrieval` is synchroon en geeft een string terug; `openEpisode` is
     async. Het episodeId moet dus op de beurt bewaard worden zodra het er is,
     zonder de aanroeper te laten wachten.
  2. `LoopAgent` kent `'chat' | 'trading' | 'code-editor' | 'browser' |
     'research'`. De eigenaar `'local-code'` die ik zette staat daar niet in —
     kies of die erbij hoort of onder `code-editor` valt.
  3. Zonder Supabase-sessie geeft `openEpisode` netjes null. De beurt in
     localStorage moet dan gewoon blijven werken; offline mag geen fout geven.

  **Meet je resultaat zo:** voer een chatbericht in, en daarna:
  ```sql
  select agent, count(*) from agent_learning_episodes group by agent;
  ```
  Er hoort een rij `chat` bij te komen. Nu staat daar alleen `trading`.


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
- [ ] **3.3** LSE als databron aansluiten — de leiding ligt er, de kraan niet.
- [ ] **3.4** Alle frameworks bruikbaar: vectorbt, nautilus, kronos.
      *Aanname: ze draaien op de VPS maar zijn niet vanuit de app te kiezen.*

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

## Hoe je een punt afvinkt

Niet omdat de code er staat. Alleen met bewijs dat losstaat van je eigen
redenering: een test die faalt zonder je wijziging, een meting, een screenshot.

Blijkt een punt niet te kloppen, verbeter dan de tekst hier in plaats van er
stilletjes iets anders van te maken.
