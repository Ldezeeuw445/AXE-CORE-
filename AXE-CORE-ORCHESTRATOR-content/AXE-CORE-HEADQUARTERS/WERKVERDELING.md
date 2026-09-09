# Werkverdeling — 9 september 2026

Vier sessies werken tegelijk aan AXE CORE. Deze verdeling is zo gemaakt dat
niemand dezelfde bestanden aanraakt: dan kan er niets botsen, ook niet als je
alle vier tegelijk pusht.

**Lees eerst `AGENTS.md` in de hoofdmap.** Daar staan de vallen.

## De regels, voor iedereen gelijk

1. **Eén tak: `orchestrator`.** Maak geen nieuwe tak. Vandaag ging het één
   keer mis doordat een sessie naar `fix/research-report-save` sprong en het
   werk daar bleef staan.
2. **Blijf in je eigen bestanden.** Staat het niet in jouw lijst, raak het niet
   aan. Moet je er echt aan, zeg het tegen Luka in plaats van het te doen.
3. **Trekken vóór duwen.** `git pull --rebase origin orchestrator`, dan pas
   pushen. Klein en vaak, niet één grote commit aan het eind.
4. **Voor je zegt dat iets klaar is:**
   ```bash
   npx tsc --noEmit && npx vitest run && npx eslint src
   ```
   733 tests groen, 21 bestaande lintfouten — voeg er geen toe.
5. **Bewijs, geen aanname.** Een test die faalt zonder je wijziging, of een
   meting. "Het staat in de code" telt niet.

---

## COWORK — de agents-tab

**Doel:** één lijst met de agents die er echt zijn, met wat ze kunnen.

**Wat er mis is, gemeten:** `core_agents` bevat 18 agents. De tab toont er 29,
omdat hij hardgecodeerde defaults samenvoegt met de database. AXE Core, AXE
Intel en AXE Companion staan er twee keer. Drie agents hebben status `statue` —
geen geldige waarde, waarschijnlijk een typefout voor `static`.

**Jouw bestanden:**
```
src/presentation/pages/Agents.tsx
src/domain/agents.ts            (als die bestaat)
src/presentation/components/agents/**
```

**Taken:**
1. Kies één bron. De database is de waarheid; de defaults zijn een restant.
   Zorg dat elke agent precies één keer voorkomt.
2. Zoek uit wat `statue` moest zijn en repareer de drie rijen.
3. Toon per agent: welke skills, welke tools, welk model.
4. Toon of zijn leerlus rondloopt — tel zijn rijen in `agent_learning_episodes`.

**Meet je resultaat zo:**
```sql
select count(*) from core_agents;              -- 18
select agent, count(*) from agent_learning_episodes group by agent;
```
De tab moet hetzelfde aantal tonen als die eerste query. Geen enkele naam twee
keer.

**Niet aankomen:** `axe-look.css`, trading, de browser, de code-editor.

---

## CURSOR — de tabs op één lijn

**Doel:** elke tab ziet eruit zoals de browser-tab.

**De maatstaf staat in `UI-MAATSTAF.md`.** Lees hem helemaal; hij is kort en
elke regel komt uit een fout die al gemaakt is.

**Jouw bestanden:**
```
src/presentation/pages/*.tsx     (BEHALVE Agents.tsx en alles onder tradingIntel/)
src/design/axe-look.css
```

**Taken, in deze volgorde:**
1. Deze tabs gebruiken minder dan de helft van de hoogte — eerst deze vier:
   `eve` 32%, `tasks` 46%, `cron-manager` 47%, `mcp` 50%.
2. Daarna langs de rest: Apps, Knowledge, Control Plane, Calendar, Cron,
   Organization, Terminal, Obsidian, Maps, CrewAI, Table editor, Developer.

**De val die vandaag vier keer toesloeg:** dezelfde CSS-regel staat soms twee
of drie keer in `axe-look.css`, honderden regels uit elkaar. Verander je de
bovenste en zie je geen verschil, zoek dan naar een tweede. Er staan tests op:
`plaatTint.test.ts` en `railBreedte.test.ts`.

**Meet je resultaat zo:** open de tab naast de browser-tab. Ligt de linkerrand
van het bovenste blok op dezelfde lijn als die van de composer? Zo niet, dan
mist `.axe-tabruimte`.

**Niet aankomen:** Agents.tsx, trading, de gateways, de backend.

---

## CLAUDE-SESSIE 2 — de leerlus en RAG

**Doel:** elke agent leert, en Luka kan zien dat het gebeurt.

**Waar het staat:** de lus heet nergens "RAG". De keten is:
```
buildGlobalMemoryContext → buildDurableMemoryContext → searchGlobalBrain
  → noteRetrieval          (hier ontstaat de "beurt")
→ latestOpenTurnId(eigenaar) → noteTurnOutcome
```
Trading loopt apart, via episodes in `agent_learning_episodes`.

**Wie doet al mee:** chat, browser, code-editor, lokale code, trading.
**Wie nog niet:** `agenticEngine`, `langGraphOrchestrator`.

**Jouw bestanden:**
```
src/application/agents/agenticEngine.ts
src/application/agents/langGraphOrchestrator.ts
src/infrastructure/persistence/*memory*
src/infrastructure/persistence/agentFeedbackService.ts
src/domain/memory/**
```

**Taken:**
1. Die twee agents in de lus zetten, zoals `browserAgentLoop.ts` het doet.
   Kijk daar eerst — dat is het werkende voorbeeld.
2. Zorg dat elke agent zijn EIGEN beurt pakt: `latestOpenTurnId('naam')`.
   Zonder naam pakt hij die van een ander.
3. Maak de RAG-bestanden zichtbaar: welke herinneringen gingen een beslissing
   in, en wat is ermee gebeurd.

**De val:** `learningLoopWiring.test.ts` bewaakt dat elke ingang een aanroeper
heeft. Vijf keer vandaag bleek code gebouwd, getest, en door niemand
aangeroepen. Groene tests bewijzen niet dat iemand het gebruikt — zoek de
aanroeper.

**Niet aankomen:** de UI, trading, de backend op de VPS.

---

## CLAUDE CODE (deze sessie) — trading, computer use, browser

**Jouw bestanden:**
```
src/application/tradingIntel/**
src/domain/tradingIntel/**
src/presentation/pages/tradingIntel/**
src/infrastructure/gateways/computerRelay.ts
src/application/tools/toolRegistry.computer.ts
src/presentation/components/browser/**
backend/axe_api/**        (de VPS-backend)
```

**Taken:**
1. Trading per account laten draaien, met eigen instellingen (drawdown,
   dagverlies, risico).
2. LSE als databron aansluiten — de route werkt, niets gebruikt hem.
3. Computer use aansluiten: `computerRelay.ts` bestaat en wordt door niets
   aangeroepen.
4. De browser buiten de app testen.

---

## Als je toch in elkaars bestanden moet

Zeg het tegen Luka. Twee sessies in één bestand geeft een conflict dat niemand
kan overzien, en dan ben je een uur kwijt aan iets wat niets oplevert.
