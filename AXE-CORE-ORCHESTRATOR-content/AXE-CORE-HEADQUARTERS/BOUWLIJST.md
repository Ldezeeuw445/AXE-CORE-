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

### ✅ Rechtgezet: die achttien orders hebben nooit bestaan

Hier stond dat er op 8 september tussen 19:15:59 en 19:16:13 **18 XAUUSD-orders**
naar MT5 100K DEMO gingen, met achttien verschillende instapprijzen. Dat klopt
niet, en dit is wat er werkelijk gebeurde (gemeten 9 september, direct op de
database).

**Het waren geen orders maar een inleesronde.** Op 8 september 17:15–17:16 UTC
(19:15–19:16 bij ons — daar zat óók een uur verschil in de eerdere lezing) zijn
er 38 rijen in `core_trading_trades` geschreven. Alle 38:

- `exit_reason = broker_close`
- `status = closed`, met pnl er al bij
- geopend tussen **21 augustus en 4 september**, niet die avond
- geen `local_trade_id` — ze komen niet uit een beslissing van AXE

Het zijn dus afgesloten trades die bij de broker stonden en die avond in één
keer in het journaal zijn gezet. Hun `created_at` valt binnen anderhalve minuut;
hun instapprijzen verschillen omdat het trades van verschillende dagen zijn.
Dát is ook de verklaring voor "de prijs bewoog ±30 per seconde": dat was geen
koersvoeding die op hol sloeg, maar goudprijzen van twee weken op een rij gezet
op volgorde van invoegen.

De 7 rijen zonder strategie, framework of reden waren het duidelijkste signaal
en werden als raadsel gelezen: het zijn precies de trades die AXE níét bedacht
heeft, dus er valt niets in te vullen.

**Tegencheck bij de broker.** Op 8 september opende de broker in totaal **8**
XAUUSD-trades, verspreid over de hele dag (06:27, 10:32, 13:28, 13:41, 14:14,
18:49, 19:15, 20:49 UTC). Nooit meer dan één per minuut. Er is geen burst.

De twee reparaties hieronder blijven zinvol op eigen kracht — een dagteller die
de papieren spiegel las en een account dat dubbel in de lijst kon staan zijn
echte fouten — maar ze zijn niet de oplossing van een probleem dat er was.

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
- [x] **3.0 — de open vraag is beantwoord** Zie hierboven: er was geen trigger,
      want er was geen burst.
- [ ] **3.0b — de inleesronde verliest de openingstijd** Alle 43 rijen met
      `exit_reason = broker_close` hebben `opened_at = closed_at`; bij de broker
      staat er wél een echte openingstijd (een van 6:27 tot 13:25 bijvoorbeeld).
      Elke berekening over hoe lang een trade openstond is voor die rijen dus
      fout. Klein om te repareren, maar het zit stil in de data.

- [ ] **3.1** Per account draaien. Nu draait de cyclus over alle accounts met
      één paarlijst; de MT5-accounts krijgen symbolen die hun broker niet heeft.
- [ ] **3.2** Instellingen per account: drawdown, dagverlies, risico.
      `maxDrawdownPct` bestaat in `botTypes.ts` maar is niet per account
      instelbaar in de UI.
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
