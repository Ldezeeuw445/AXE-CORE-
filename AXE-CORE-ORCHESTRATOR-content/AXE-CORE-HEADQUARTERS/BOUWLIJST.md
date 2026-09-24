# AXE CORE — bouwlijst

Bijgewerkt 23 september 2026. Alles hieronder is **gemeten**, niet aangenomen.
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

## Hoe je een punt afvinkt

Niet omdat de code er staat. Alleen met bewijs dat losstaat van je eigen
redenering: een test die faalt zonder je wijziging, een meting, een screenshot.

Blijkt een punt niet te kloppen, verbeter dan de tekst hier in plaats van er
stilletjes iets anders van te maken.

---

## 7 — axe-commandolaag (fundament van de node-agent)

De CLI en het hek zijn de fundering. AXE is zelf de uitvoeringslaag;
Rabbit OS3 is een optionele extra executor via dezelfde `cli/axe`.
De hekken zitten in de CLI en in `backend/axe_api/cli_laag.py`, niet
alleen in docs.

- [x] **7.1** `axe` CLI (Python 3, geen extra packages) + geteste parser,
      guardrails en JSON-uitvoer (`src/cli/*.test.ts`, `cli/test_axe_laag.py`).
- [x] **7.2** Commando's mappen op wat er al is: taken, geheugen/RAG,
      agents/durable kernel, NorthSea (read-only), trading cockpit, cron, MCP.
- [x] **7.3** Hek: alleen-lezen tot `--write`; hard geblokkeerd: mail,
      NorthSea `auto_send_*`, merge naar `orchestrator`, wissen.
- [x] **7.4** `os3/SKILL.md` + `os3/SETUP.md` (AXE-node eerst, OS3 extra).
- [x] **7.8** `axe node list|register|run` + `/cli/nodes*` (pairing-token
      hashed, heartbeat naar `core_computer_workers`, jobs tonen niet
      uitvoeren). Tests: `src/cli/commands.test.ts`, `test_cli_laag.py`.
- [ ] **7.5** Gemeten op de Mac mini en de VPS: `axe status --json` en de
      vijf testprompts uit SETUP.md. Hier niet live gemeten.
- [ ] **7.6** `cli_laag.py` op de box (`vps_sync.py check` na deploy).
- [ ] **7.7** AXON als geheugenbackend achter dezelfde `axe memory`-poort.

---

## 8 — AXE node-agent (fase 2) — protocol, tabellen, security

**Besluit:** AXE Core wordt zelf het OS3-achtige systeem. Geen
afhankelijkheid van Rabbit. `axe node run` is AXE's equivalent van
'rabbit agent'. Deze PR levert de CLI + pairing + presence; **niet**
de executor. Een volledige daemon hier zou `infra/computer-worker` en
`infra/claude-local-worker` dupliceren — die bestaan al en doen outbound
poll. Fase 2 trekt ze samen onder `axe node`.

### Wat er al draait (niet opnieuw bouwen)

| Stuk | Waar | Protocol |
|---|---|---|
| Presence | `core_computer_workers` (`device_id` PK, `heartbeat_at`) | upsert, 45s stale (`computerRelay.ts`) |
| Jobs | `core_tasks` + `target_device` + `capability` | pending → claim (PATCH alleen als nog pending) + lease |
| Trace | `core_task_events` (append-only) | streaming voortgang |
| Approvals | `core_approvals` | zelfde hek als de CLI |
| Computer-use worker | `infra/computer-worker/worker.mjs` | poll `capability=computer_use`, outbound naar Supabase |
| Claude-local worker | `infra/claude-local-worker` | poll `capability=claude_local` |
| launchd | `com.axe.computer-worker` | `scripts/install-computer-worker-launchd.sh` |

Computer Use-tab toont al `onlineDevices()`. LiveKit `core_devices` is
een **andere** tabel — niet hergebruiken.

### Protocol (fase 2)

1. Node belt **alleen outbound** naar `https://api.axecompanion.com`
   (Bearer `AXE_API_KEY`) plus het pairing-geheim (`AXE_NODE_TOKEN`).
   Geen inbound poort. Werkt remote (Device Manager, PR #149) omdat
   de machine zelf de verbinding opent.
2. Transport nu: HTTP long-poll, 1,5s, gelijk aan computer-worker.
   `GET /cli/nodes/jobs?device_id=` → `POST /cli/nodes/jobs/{id}/claim`
   → events op `core_task_events` → settle. Supabase Realtime op
   `core_tasks` gefilterd op `target_device` is later een optimalisatie,
   geen vereiste.
3. Claim is de lock: `UPDATE core_tasks SET status=running WHERE id=?
   AND status=pending`. Twee nodes racen; één wint. Lease 90s.
4. Job-payload (niet een vrije shell-string als uitvoerpad):

```json
{
  "kind": "shell" | "file_read" | "file_write" | "claude_code",
  "argv": ["git", "status"],
  "workspace": "AXE Core",
  "path": "src/cli/catalog.ts",
  "prompt": "…",
  "timeout_sec": 120
}
```

`workspace` is een **naam**. Het pad wordt lokaal opgelost (zoals
computer-worker `AXE_WS_*` al doet). Een pad uit de rij is fout: dezelfde
naam is een andere checkout op mini vs iMac.

5. Tier-3 router (PR #179, niet deze PR) zet `target_device` +
   `capability=node_agent` (of blijft `computer_use` / `claude_local`
   tot de unify klaar is). Zonder online heartbeat: niet queueën,
   meteen "die machine is uit" — anders wacht een model en verzin hij.

### Tabellen

**Niet splitsen.** Presence blijft `core_computer_workers`. Een tweede
`core_nodes` naast workers is hoe je "online" op twee plekken krijgt.

Additive migratie (nog niet toegepast — fase 2):

```sql
alter table public.core_computer_workers
  add column if not exists name text,
  add column if not exists os text,
  add column if not exists capabilities jsonb not null default '[]'::jsonb,
  add column if not exists paired_at timestamptz;

-- pairing-geheim, niet de API-key. Hash only. Rotate = nieuwe register.
create table if not exists public.core_node_secrets (
  device_id   text primary key references public.core_computer_workers(device_id) on delete cascade,
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz
);

alter table public.core_node_secrets enable row level security;
-- alleen service role, geen anon.

-- capability-index voor de node-agent (naast computer_use)
create index if not exists idx_core_tasks_node
  on public.core_tasks (capability, target_device, status, created_at)
  where capability = 'node_agent';
```

Tot die migratie live is, leeft de pairing-hash tijdelijk in
`global_memory` (`category=node_pair`, key `cli/node-pair/{device_id}`).
Dat is een wachtkamer, geen eindstation: `global_memory` is geen
geheimhoudingstabel.

### Security

Zelfde hek als de CLI, afgedwongen **op de node** (waar de schade
gebeurt), niet alleen in de UI of de API:

| Regel | Waar |
|---|---|
| Hard blok: mail / outbound, NorthSea `auto_send_*`, merge/`HEAD:orchestrator`, wissen/`rm -rf` | CLI + `cli_laag.py` + node-executor |
| Approval: git push/commit, systemctl, docker, trading-exec, NorthSea-write | `core_approvals`, zichtbaar in AXE |
| Allowlist read-only zonder approval | `git status`, `git diff`, `ls`, `cat` binnen workspace |
| Workspace-pad nooit uit de rij | lokale `AXE_WS_*` / bestaande `WORKSPACE_DEFS` |
| Pad blijft in de workspace; geen `..`, geen symlink naar kluis | `safePath` uit computer-worker hergebruiken |
| Denylist | `AXE-VAULT`, `~/.ssh`, credential-bestanden |
| Commando = argv, geen `sh -c` | geen injectie |
| Token plaintext één keer; daarna alleen hash | `hash_token` / `token_matches` |
| `AXE_API_KEY` ≠ node-token | API-key is de VPS-bearer; token is "deze machine" |
| Audit elk job-event, geheimen geredacteerd | `core_audit_log` + `core_task_events` |
| Geen inbound poort, geen publieke node-API | alleen outbound |

Pairing-flow: `axe node register` toont token één keer (15 min geldig
tot eerste heartbeat). Daarna is dezelfde token het node-geheim
(hashed). Opnieuw registeren roteert hem.

### Unify (één daemon)

`axe node run --daemon` wordt de enige process op de machine:

- capabilities die hij adverteert bepalen wat hij pakt:
  `computer_use`, `claude_local`, `node_agent`
- `infra/computer-worker` en `infra/claude-local-worker` blijven de
  implementatie van de tools tot hun code hinter `axe node` hangt
- daarna: één launchd-label `com.axe.node`, één systemd-unit
  `axe-node.service` (`scripts/install-axe-node.sh` staat er al)
- niet drie KeepAlive-processen hetzelfde `core_tasks`-slot laten
  claimen

### UI

Computer Use-tab + `onlineDevices()` uitbreiden met `os`, `last_seen`,
`capabilities`, `paired`. Geen nieuwe tab tot die velden er zijn.
Device Manager (PR #149) blijft remote-bediening van Samsung; de node
is hoe AXE werk op Luka's computers zet terwijl hij weg is.

### Wat fase 2 níet is

- Geen publieke OS3-API, geen inbound webhook.
- Geen mergen naar `orchestrator` vanaf een node.
- Geen mail, geen NorthSea auto-send.
- Geen tweede waarheid naast `core_tasks`.

### Afvinken (pas in de fase-2 PR)

- [ ] **8.1** Migratie `core_node_secrets` + kolommen op
      `core_computer_workers`. Gemeten: `vps_sync` niet van toepassing;
      Supabase-migratie toegepast, pairing niet meer in `global_memory`.
- [ ] **8.2** Executor: shell (argv + allowlist), file read/write in
      workspace, Claude Code headless. Zelfde hek. Tests die falen
      zonder de executor (blok, approval, pad-escape).
- [ ] **8.3** Claim + lease + `core_task_events` stream (stdout-chunks).
      Gemeten: één job, twee nodes, precies één claim.
- [ ] **8.4** computer-worker + claude-local achter `axe node`; oude
      launchd-labels uit. Gemeten: `onlineDevices()` blijft groen op
      de mini, één process in `launchctl print`.
- [ ] **8.5** Tier-3 router (PR #179) mag `target_device` zetten.
      Niet deze PR; niet mergen tot 8.2 groen is.
- [ ] **8.6** Live: register + run op mini, iMac en VPS; `axe node list`
      toont drie rijen, heartbeat < 45s. Hier niet gemeten.
