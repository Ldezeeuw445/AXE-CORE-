# AXE CORE — bouwlijst

Eén lijst. Staat er iets niet in, dan doen we het niet. Staat er een vinkje,
dan is het **gemeten**, niet aangenomen.

Er lagen vijftien losse documenten waarvan de nieuwste bouwlijst van 21 augustus
was. Die staan nu in `docs/archief/`. Dit bestand is de enige waarheid.

**Regel voor een vinkje:** iets is pas af als er een meting of een screenshot bij
hoort. "De code klopt" telt niet — dat is vandaag vier keer misgegaan.

---

## Waar we staan (8 september)

| | |
|---|---|
| Tabs totaal | 37 |
| Tabs met eigen zijbalk | 9 |
| Tabs die Home's zijbalk tonen | 28 |
| Tests | 687 groen |
| Agents in de leerlus | 4 van 6 |

---

## Fase 1 — Elke tab klopt

Per tab: rails op de juiste plek, geen dubbele balken, kaarten dicht, pagina
gebruikt de ruimte. Meten met `?ontwerp=1` (zie `LOCAL_DEV.md`).

- [x] **1.1** Chatplaat nam 42% van elk scherm — dicht op elke tab behalve Home.
      *Gemeten: pagina 288px → 692px.*
- [x] **1.2** Zijbalken een kwart breder. *Gemeten: 240→300 links, 320→400 rechts.*
- [x] **1.3** Kaarten dicht. *`--surface-bg` stond dubbel gedefinieerd; de
      doorzichtige overschreef de goede.*
- [x] **1.4** Dubbele balken weg. De pagina's brachten hun eigen doos mee in de
      rail (240px vast, eigen zwart, streep rechts). De regels die dat moesten
      neutraliseren stonden op `.axe-slot--rail`, maar TabRail portalt naar
      `.axe-rail-host` -- één verkeerde selector, negen tabs die er verkeerd
      uitzagen. *Gemeten op Table editor: inhoud 268px, eigen achtergrond weg,
      standaardrail verborgen.*
- [x] **1.5** De tabs zonder eigen rail tonen niet langer die van Home. Die balk
      bevatte THINKTHANKS, AI CORE SYSTEM, AI CORE LOGS, VPS HEALTH, CODE AGENT,
      BROWSER en KIMI TOOLS -- en elk van die zeven heeft zijn eigen tab. Op 27
      tabs tonen was een kopie van zeven tabs, telkens opnieuw. Nu alleen op
      Home; elders de eigen rail van die tab, of geen. *Gemeten: home 300+400,
      agents/crewai/settings alleen 400, table-editor 300+400 met eigen inhoud.*
- [x] **1.6** Crashende tabs. *Alle 27 routes gelopen: twee echte crashes, niet
      vier -- de rest kwam van de VPS. Settings viel om op
      `cap.keyword_patterns.length` en Infrastructure op `name.startsWith` in
      classifyTable. Beide dezelfde faalwijze: één ontbrekend veld in één rij
      neemt de hele pagina mee. Nu nul crashes op alle 27.*
- [x] **1.7** Eén stijl: geen enkel doorschijnend vlak ligt nog los op de plaat.
      `--bg-panel`, `--bg-elevated`, `--bg-surface` en `--card-2` werden in
      axe-look.css stil overschreven met wit op 4,5 tot 6,5 procent, terwijl
      app/index.css ze al dicht had. Derde keer dezelfde stille overschrijving
      in dat bestand. *Gemeten over alle 26 tabs: 0 losse vlakken.*
- [x] **1.8** ~~Vier tabs gebruiken minder dan de helft van de hoogte~~ --
  **die meting was fout.** Het testvenster had hoogte 0, waardoor `100dvh` naar
  nul rekende en elke verhouding onzin werd. Opnieuw gemeten met een echt
  venster: eve, tasks, cron-manager, mcp en finance zitten allemaal op 100%
  breedte en hoogte, nul doorschijnende vlakken. Er was niets te repareren.

  *Twee valkuilen vastgelegd in `ontwerpModus.ts`: een verborgen browserpaneel
  krijgt geen animatieframes (elke pagina lijkt dan onzichtbaar), en een
  paneel met hoogte 0 maakt elke procentmeting waardeloos.*

- [x] **1.9** De ontwerpmodus vult nu ook `localStorage`, niet alleen de
  database. EVE en de modelkiezer lezen hun providers daaruit; zonder dat
  beoordeelde ik leegte die alleen in de testbrowser bestaat.


- [x] **1.10** Elke tab op de bandbreedte. *Gemeten: linkerrand pagina 287px,
  linkerrand composer 287px. Op één plek geregeld -- het vlak waar elke route
  doorheen komt -- want 27 pagina's los aanpassen is 27 kansen op een
  afwijking. `.axe-vol-breed` is de uitzondering voor wie echt de volle breedte
  nodig heeft.*

- [x] **1.11** De browser-tab is de maatstaf geworden. *Luka op 8 sep: "dit is
  het hele UI stijl wat ik elke keer al bedoel." Staat uitgeschreven in
  UI-MAATSTAF.md -- acht regels, met per regel waar het eerder misging, en hoe
  je regel 2 meet in plaats van bekijkt.*

- [x] **1.12** Kaarten dicht op vijf tabs. *Settings, Calendar, EVE, Memory en
  de agent-chat hadden `${kleur}08` -- drie procent dekking. Op de glazen plaat
  is dat geen kaart maar een waas. kaartDekking.test.ts faalt zodra iemand die
  vorm weer schrijft.*

- [x] **1.13** "NaNms" op het MCP-scherm. *Delen door een telling van nul.
  domain/gemiddelde geeft null, toonGetal maakt er een streepje van. De andere
  twaalf tabs nagelopen op NaN, undefined, [object Object] en Invalid Date:
  geen enkele.*

- [x] **1.14** De rail-host verdween op twee manieren tegelijk. *Hij stond
  alleen in de uitgeklapte tak, en TabRail stopte met kijken na de eerste
  vondst -- bij het uitschuiven wordt het element vervangen. Drie tests, alle
  drie falend op de oude code.*

- [ ] **1.15** ONGEVERIFIEERD: staan de widgets van Neural, Terrain en
  Architecture nu in de rails? *De dev-server rendert Sidebar en RightPanel
  niet, dus daar valt het niet te meten. Moet in de app zelf bekeken worden.
  Staan ze er niet, dan terug naar PlaatSlot.*

## Fase 2 — Audit per tab

Pas beginnen als fase 1 af is, anders audit je een bewegend doel.

- [ ] **2.1** Per tab: wat werkt, wat is dood, wat is dubbel.
- [~] **2.2** Weg wat niet gebruikt wordt. *Gemeten op 9 sep: 112 bestanden
  zonder enige verwijzing, waarvan 8 shadcn-bibliotheek (normaal) en 18 eigen
  code. Niets verwijderd -- dat is jouw beslissing, niet de mijne. De grootste:*

  | regels | bestand | wat het lijkt |
  |---|---|---|
  | 863 | `application/agents/agenticEngine.ts` | agent-motor, nooit aangeroepen |
  | 531 | `axe-core/AgentChatHub.tsx` | chat-hub |
  | 497 | `axe-core/OrganizationCanvas.tsx` | organisatiekaart |
  | 472 | `axe-core/ArchitectureCanvas.tsx` | architectuurkaart |
  | 451 | `axe-core/CodeEditor.tsx` | oudere code-editor |
  | 436 | `maps3d/MapsViewer.tsx` | kaartweergave |
  | 327 | `widgets/SmartRingWidget.tsx` | slimme ring |
  | 321 | `infrastructure/persistence/sharedMemory.ts` | gedeeld geheugen |
  | 297 | `ai/AISidebar.tsx` | zijbalk-chat (al bekend) |
  | 241 | `widgets/HabitTrackerWidget.tsx` | gewoontetracker |
  | 212 | `widgets/SmartHomeWidget.tsx` | slimme woning |

  *Sommige hiervan zijn dingen die je bewust bouwde en later loskoppelde. Weg
  is weg -- dus eerst jouw oordeel, dan pas verwijderen.*

- [ ] **2.2b** Losgekoppelde code telt als dood --
      er zijn er vandaag vier gevonden die er werkend uitzagen.
- [ ] **2.3** Eén lijst van wat er echt in de app zit.

## Fase 3 — De agents kunnen wat Claude kan

Dit is wat AXE Core bruikbaar maakt. De tabs zijn de huid, dit is het lijf.

- [ ] **3.1** Vaststellen wat "kunnen wat Claude kan" concreet is: bestanden
      lezen en schrijven, commando's draaien, web zoeken, tools ketenen.
- [ ] **3.2** Per agent: welke van die dingen mag hij nu, en wat mist.
- [ ] **3.3** Het gat dichten, agent voor agent.

## Fase 4 — Luka kan het zelf

Zodat je niet elke storing hoeft door te geven.

- [x] **4.1** Eén plek waar staat waar elke sleutel woont. *SLEUTELS.md.
  Vier plaatsen: de kluis op de SSD (103 sleutels, de enige bron), .env in de
  repo (15, een kopie), Instellingen → Keys in de app zelf (localStorage +
  user_settings achter RLS), en /opt/axe-core-api/.env op de VPS. Namen en
  plaatsen, nooit waarden -- het staat in git.*
- [ ] **4.2** `axe-status` zegt bij elke rode regel wat je eraan doet.
- [ ] **4.3** Strato: uitzoeken waarom hij blijft stoppen. *9 sep 07:59 UTC
  weer weg, en anders dan eerder: geen ping, poort 22/80/443 allemaal dicht.
  Gisteren stonden de poorten nog open terwijl er niets antwoordde
  (verstikking); dit is een harde uitval. De Ollama-host draaide gewoon door.
  Vastgelegd in .axe-status.log.*
- [ ] ~~**4.3** Strato: uitzoeken waarom hij blijft stoppen.~~ *Op 7 sep was het
      OOM door ollama; dat is verholpen en begrensd. Valt hij tóch weer om, dan
      is het iets anders — `memory.events` zegt welke.*

---

## Wat vandaag opgelost is

- VPS viel 12× per week om: OpenHands laadde een 4,9GB-model in een 7,7GB bak
  zonder swap. Nu 4GB swap plus een cgroup-grens. Bewezen onder belasting.
- De leerlus was gebouwd maar niet aangesloten: twee ingangen hadden nul
  aanroepers, dus `agent_learning_episodes` stond op nul rijen.
- Statuscheck gaf vals alarm: vroeg de wortel van de API op, kreeg terecht 404,
  en toonde dat als storing.
- `main` was 47 commits vooruit op `orchestrator`. Nu gelijk.
