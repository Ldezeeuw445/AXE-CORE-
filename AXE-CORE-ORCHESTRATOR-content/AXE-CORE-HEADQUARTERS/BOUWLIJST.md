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
- [ ] **1.5** De 28 tabs zonder eigen rail: elk zijn eigen inhoud, of bewust geen.
- [ ] **1.6** Vier tabs crashten (foto's 7 sep). Opnieuw meten nu de VPS terug is.
- [ ] **1.7** Symmetrie en één stijl per tab, met screenshot als bewijs.

## Fase 2 — Audit per tab

Pas beginnen als fase 1 af is, anders audit je een bewegend doel.

- [ ] **2.1** Per tab: wat werkt, wat is dood, wat is dubbel.
- [ ] **2.2** Weg wat niet gebruikt wordt. Losgekoppelde code telt als dood --
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

- [ ] **4.1** Eén plek waar staat waar elke sleutel woont.
- [ ] **4.2** `axe-status` zegt bij elke rode regel wat je eraan doet.
- [ ] **4.3** Strato: uitzoeken waarom hij blijft stoppen. *Op 7 sep was het
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
