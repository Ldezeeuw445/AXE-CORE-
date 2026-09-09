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

### ⚠ Eerst dit: achttien orders in veertien seconden

Gemeten 9 september op `core_trading_trades`. Op 8 september tussen 19:15:59 en
19:16:13 gingen er **18 XAUUSD-orders** naar MT5 100K DEMO. Achttien
verschillende instapprijzen, dus achttien echte orders — geen dubbele
logregels. Ook 7× AUDUSD op datzelfde account.

Op een demo kost dat niets. Op een echt account is dit het soort fout waar je
niet van wilt horen.

**Wat ik zeker weet:**
- `maxTradesPerDay` bestaat (20 in het standaardprofiel) en wordt getoetst in
  `tradingAgentEngine.ts:565`.
- De teller komt uit het PAPIEREN account: `account.trades.filter(...)` op
  regel 560 — niet uit wat de broker werkelijk heeft.
- Er zit geen herhaallus in het plaatsen zelf.

**Wat ik nog niet weet:** wat die achttien beslissingen afvuurde.

- [x] **3.0 — de rem** De dagteller leest nu de BROKER, niet de papieren
      spiegel. `brokerOpeningsTodayFor()` in `brokerConnector.ts` telt de echte
      opening-deals (`DEAL_ENTRY_IN`/`INOUT`) van vandaag per account; een
      onleesbare broker geeft `null` → de cyclus HOUDT vast (`dayCountUnverified`)
      in plaats van blind te traden, en dat blokkeert alleen een OPEN, nooit een
      exit. Daaronder telt een in-proces teller elke plaatsing mee op het moment
      dat hij vertrekt, vóór hij in de historie staat — zodat meerdere bijna
      gelijktijdige beslissingen niet allemaal dezelfde teller-van-vóór-de-burst
      lezen. `dayLimitState()` bundelt de regel puur en getest
      (`dayLimit.test.ts`, 9 tests, incl. het 8-sept-scenario).
      Engine: `tradingAgentEngine.ts` (regel ~560, was de papieren `.filter`).
- [x] **3.0 — een dubbel-order-lek** `addAccount()` controleert niet op een
      bestaande `accountId`, dus dezelfde MT5-account kan twee keer in de lijst
      staan; `selectTradeable()` gaf ze beide terug en `runOnEveryAccount` plaatst
      per invoer een order → twee echte orders op één account per cyclus.
      `selectTradeable()` dedupt nu op accountId (`tradeableAccounts.test.ts`).
- [ ] **3.0 — open vraag, nog steeds** De exacte trigger van de 8-sept-burst
      (18× XAUUSD in 14s naar één account) is uit de code alléén niet te bewijzen.
      Bewezen mechanismen die zo'n burst KUNNEN voeden zijn nu dicht (teller op de
      broker; in-proces cap; account-dedup). Om de trigger zelf hard te maken is
      de dag-data van 8 sept nodig (`core_trading_trades` + cyclus-records rond
      19:15). Ik zet het als vraag neer, niet als aanname.

- [ ] **3.1** Per account draaien. Nu draait de cyclus over alle accounts met
      één paarlijst; de MT5-accounts krijgen symbolen die hun broker niet heeft.
- [ ] **3.2** Instellingen per account: drawdown, dagverlies, risico.
      `maxDrawdownPct` bestaat in `botTypes.ts` maar is niet per account
      instelbaar in de UI.
- [ ] **3.3** LSE als databron aansluiten — de leiding ligt er, de kraan niet.
- [ ] **3.4** Alle frameworks bruikbaar: vectorbt, nautilus, kronos.
      *Aanname: ze draaien op de VPS maar zijn niet vanuit de app te kiezen.*

## 4 — Computer use, browser, code-editor

- [ ] **4.1** **Computer use is gebouwd maar niet aangesloten.**
      `computerRelay.ts` bestaat, `toolRegistry.computer.ts` importeert hem,
      en verder roept niets het aan.
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
