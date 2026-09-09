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

- [ ] **3.0** Uitzoeken wat de burst veroorzaakte, en de dagteller op de
      BROKER baseren in plaats van op de papieren spiegel. Zonder dat is er
      geen echte rem.

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
