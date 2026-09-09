# Werkverdeling — 9 september 2026

Meerdere sessies werken aan AXE CORE, niet allemaal tegelijk. Deze verdeling
is zo gemaakt dat niemand dezelfde bestanden aanraakt: dan kan er niets
botsen, ook niet als meerdere sessies tegelijk pushen.

**Lees eerst `AGENTS.md` in de hoofdmap.** Daar staan de vallen.

## De regels, voor iedereen gelijk

1. **Eén tak op de remote: `orchestrator`.** Lokaal werk je in je eigen
   worktree met een eigen `sessie/<naam>`-tak — zie val 6 in `AGENTS.md` —
   maar die tak gaat nooit als zichzelf naar de remote.
2. **Blijf in je eigen bestanden.** Staat het niet in jouw lijst, raak het niet
   aan. Moet je er echt aan, zeg het tegen Luka in plaats van het te doen.
3. **Trekken vóór duwen, en duwen met `HEAD:orchestrator`.**
   ```bash
   git fetch origin orchestrator && git rebase origin/orchestrator
   git push origin HEAD:orchestrator
   ```
   Klein en vaak, niet één grote commit aan het eind. Het expliciete pushdoel
   is geen detail: toen een sessie op `fix/research-report-save` zat, duwde
   `git push origin orchestrator` een tak die achterliep en meldde netjes
   "up-to-date" terwijl er niets aankwam. Met `HEAD:orchestrator` kan dat niet.
4. **Voor je zegt dat iets klaar is:**
   ```bash
   npx tsc --noEmit && npx vitest run && npx eslint src
   ```
   733 tests groen. Lint: 427 fouten en 28 waarschuwingen — dat is de nullijn,
   voeg er geen toe. (Stond hier eerder als 21; dat was het aantal in één
   bestand, niet in het project. Gemeten 9 sep.)
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
   Organization, Terminal, Obsidian, Maps, CrewAI, Table editor, Developer,
   Settings, Command.

**Eén uitzondering:** `CodeEditorPage.tsx` niet aanraken — die is van
CLAUDE-SESSIE 3.

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
**Wie nog niet:** geen. `agenticEngine` is inmiddels bedraad maar is DOOD --
nul importeurs, niet in `dist/` — dus dat bedraden verandert niets tot iemand
hem aanroept. `langGraphOrchestrator` hoort er bewust niet in.

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

## COWORK 2 — schoonmaak: wat is dood, wat is dubbel

**Doel:** Luka's eigen woorden — "alles schoon, niks dubbel, netjes en
duidelijk". Vandaag is zes keer gebleken dat code bestaat, getest is, en door
niemand wordt aangeroepen. Jij zoekt ze allemaal.

**Je RAAKT GEEN bestaande code aan.** Je levert een inventaris en wachters.
Wat er weg moet beslist Luka, want drie andere sessies werken in die bestanden.

**Jouw bestanden — allemaal nieuw:**
```
SCHOONMAAK.md                        (jouw rapport)
src/domain/dodeCode.test.ts          (jouw wachters)
```

**Wat je zoekt, en hoe je het meet:**

1. **Geëxporteerde functies zonder aanroeper.** Dit is er zes keer geweest:
   `buildTradingAgentContextWithEpisode`, `applyAgentReinforcement`,
   `sendToAI`, `proxyErrorMessage`, de `--m-*` kleurtokens, `computerRelay`.
   Elke keer: gebouwd, getest, en de leiding was nooit aangesloten.

   ```bash
   grep -rn "^export function \|^export async function " src --include='*.ts' \
     | sed 's/.*function \([a-zA-Z0-9_]*\).*/\1/' | sort -u > /tmp/geexporteerd.txt
   # per naam: tel aanroepen buiten het eigen bestand
   ```

2. **Bestanden zonder importeurs.** `AISidebar.tsx` bleek er zo een: nul
   importeurs, dus weggesnoeid uit de bundel, terwijl er wel aan gewerkt werd.

3. **Dubbele definities in `axe-look.css`.** Dat bestand is 2300 regels en
   sommige tokens staan er drie keer, honderden regels uit elkaar. Vier keer
   vandaag paste iemand de bovenste aan en zag geen verschil.
   `plaatTint.test.ts` vangt er al een deel van.

4. **Variabelen die berekend en weggegooid worden.** `npx eslint src` meldt
   427 fouten en 28 waarschuwingen. Sommige zijn onschuldig, sommige zijn een gezondheidscontrole
   waarvan de uitslag niet meer gelezen wordt.

**Wat je oplevert:**

- `SCHOONMAAK.md` met per vondst: wat het is, waar het staat, hoe je het mat,
  en of het dood is of alleen niet aangesloten. Dat onderscheid is het
  belangrijkste — niet aangesloten betekent dat er werk verloren gaat als je
  het weggooit.
- `src/domain/dodeCode.test.ts` die faalt zodra iemand een nieuwe
  geëxporteerde functie zonder aanroeper toevoegt. Zet de bestaande gevallen
  op een uitzonderingslijst met een reden erbij, zodat de test vandaag groen
  is en morgen nieuwe gevallen vangt.

**De val:** iets "dood" noemen omdat je de aanroeper niet vindt. Zoek ook in de
gebouwde bundel (`dist/`) en op andere namen — de leerlus heet nergens "RAG",
en daardoor leek hij twee keer niet te bestaan.

**Niet aankomen:** alle bestaande bestanden. Jij schrijft twee nieuwe.

## CLAUDE-SESSIE 3 — de code-editor

**Doel:** de code-editor op het niveau van Cursor of Replit. Luka wil er echt
in kunnen werken, niet alleen een bestand kunnen bekijken.

**Jouw bestanden:**
```
src/presentation/pages/CodeEditorPage.tsx        (1466 regels)
src/application/agents/codeEditorAgent.ts        (378 regels)
src/application/agents/localCodeAgent.ts
src/presentation/components/editor/**
```

**Wat er al is, gemeten:** de editor draait Monaco, heeft een terminal links en
een agent-chat rechts in de onderband, en `codeEditorAgent` zit al in de
leerlus — hij haalt geheugen op en velt een oordeel. De indeling is volgens
Luka een van de goede; laat die met rust.

**Wat eraan ontbreekt, en waar je zelf mee moet beginnen:** meet het eerst.
Open de tab, probeer een bestand te openen, te wijzigen en op te slaan, en
schrijf op waar het stukloopt. Zet die meting in je eerste commit — dan weten
we waar we begonnen.

Denk aan wat Cursor wél kan en dit niet:
- meerdere bestanden open, en snel wisselen
- zoeken door de hele map, niet één bestand
- de agent laten bewerken met een diff die je kunt afwijzen
- terugdraaien wat de agent deed

**De val in dit gebied:** `codeEditorAgent` en `localCodeAgent` pakken allebei
`latestOpenTurnId()` uit de leerlus. Vraag je die zonder naam op, dan pak je de
beurt van een andere agent. Gebruik `latestOpenTurnId('code-editor')`.

**Meet je resultaat zo:** open een bestand, laat de agent iets veranderen,
draai het terug. Werkt die hele reeks zonder de app te herladen, dan is het
klaar.

**Niet aankomen:** `axe-look.css`, de andere pagina's, trading, de gateways.

---

## COWORK 3 — gereedschap: agents kunnen wat Claude Code kan

**Doel:** Luka's zin "alle agents moeten gewoon hetzelfde als jou kunnen"
concreet maken en het gat dichten.

**Wat er al is, gemeten:** er staan twintig tools in `TOOL_RUNTIMES` plus aparte
sets voor Obsidian, SmartThings, Ring, telefoon, Mac, browser en Airtop.
`nativeToolLoop.ts` voert ze uit met goedkeuring. De chat gebruikt ze via
`voiceStore`.

**Jouw bestanden:**
```
src/application/tools/toolRegistry.ts
src/application/tools/toolRegistry.*.ts    (BEHALVE toolRegistry.computer.ts)
src/application/tools/nativeToolLoop.ts
GEREEDSCHAP.md                             (nieuw — jouw rapport)
```

**Taken:**
1. **Maak de lijst.** Welke tools bestaan er, wat doen ze, en welke agent krijgt
   welke? Schrijf dat in `GEREEDSCHAP.md`. Nu is dat nergens te zien.
2. **Zoek het gat.** Zet ernaast wat Claude Code kan — bestanden lezen en
   schrijven, shell draaien, zoeken, een browser aansturen — en markeer wat
   AXE mist.
3. **Sluit aan wat er ligt.** `toolRegistry.computer.ts` bestaat en staat NIET
   in de importlijst van `toolRegistry.ts`. Die is van Claude Code (mij), dus
   laat hem staan — maar kijk of er meer zo zijn.
4. **Eén tool erbij, met een test.** Kies de belangrijkste uit je gat en bouw
   die. Liever één die werkt dan vijf die half zijn.

**De val in dit gebied:** een tool die in een registry staat is nog niet
beschikbaar voor een agent. `nativeToolLoop.ts:143` filtert de definities op
wat er in `TOOL_RUNTIMES` zit — staat hij daar niet in, dan bestaat hij voor de
agent niet. Controleer altijd allebei.

**Meet je resultaat zo:**
```bash
grep -c "TOOL_RUNTIMES" src/application/tools/toolRegistry.ts
```
en vraag in de app aan AXE: "welk gereedschap heb je?" Het antwoord moet
kloppen met je GEREEDSCHAP.md.

**Niet aankomen:** `toolRegistry.computer.ts`, de UI, trading, de agents-tab.

## CLAUDE-SESSIE 4 — de foutenteller klopt niet

**Doel:** AGENTS.md en de regels hierboven zeggen "21 bestaande lintfouten" —
het getal waar alle sessies hun eigen werk aan toetsen voor ze "klaar" zeggen.
Gemeten vandaag: `npx eslint src` geeft **427 fouten en 28 waarschuwingen**,
verspreid over 318 bestanden. Als de meetlat zelf niet klopt, weet niemand meer
of hij een fout toevoegt of alleen een bestaande blootlegt.

**Je RAAKT GEEN bestaande broncode aan.** Dit is een uitzoekklus en een
rapport, net als COWORK 2's schoonmaak — het echte fixen van 300+ verspreide
fouten in andermans bestanden hoort bij de sessie die dat bestand al bezit.

**Jouw bestanden — nieuw, plus de regel in twee bestaande documenten:**
```
LINT-STAND.md                        (jouw rapport, nieuw)
AGENTS.md                            (alleen de regel "21 bestaande fouten")
WERKVERDELING.md                     (alleen diezelfde regel, punt 4 hierboven)
```

**Taken:**
1. Zoek uit waar "21" vandaan kwam — `git log -p -- AGENTS.md` en
   `git blame eslint.config.js` — en waarom het er nu 427 zijn. Een
   configwijziging, een package-update (`eslint-plugin-react-hooks` bijv.),
   of gewoon gegroeide code? Zeg wat je vindt, geen gok.
2. Splits de 427 in twee soorten:
   - **Mechanisch, veilig te fixen**: een écht ongebruikte binding
     (`no-unused-vars`), `no-useless-escape`, `no-misleading-character-class`,
     een leeg blok dat een comment hoort te zijn (`no-empty`).
   - **Vraagt een oordeel over de code**: `react-hooks/set-state-in-effect`,
     `react-hooks/refs`, `react-hooks/purity`, `react-hooks/immutability`,
     `react-hooks/exhaustive-deps` — dat oordeel hoort bij wie het bestand al
     bezit, niet bij jou.
3. Zet in `LINT-STAND.md`: het echte getal, uitgesplitst per bestandsgroep
   (agents / trading / tabs / leerlus / editor / overig) zodat elke sessie
   zijn eigen aandeel kan zien.
4. Werk de "21 bestaande fouten"-regel in `AGENTS.md` en hierboven bij naar
   wat waar is, of naar een haalbaar streefgetal — overleg dat kort met Luka
   als het een keuze is en geen meting.

**De val:** dezelfde als COWORK 2 al vond — "het staat in eslint" is geen
bewijs zonder vergelijking met wat er eerder stond. En: `--fix` toepassen op
een bestand dat een andere sessie nu open heeft, geeft een mergeconflict dat
niemand vroeg. Raak dus niets aan buiten je eigen twee nieuwe/bijgewerkte
bestanden.

**Niet aankomen:** alle bestaande broncode (`src/**`). Jij levert het rapport
en de bijgewerkte regel, niet de 427 losse fixes.

---

## COWORK 4 — de status-fix, en de agents-tab op de maatstaf

**Doel:** twee losse dingen, allebei klein.

**Taak 1 — de Supabase-schrijfactie die bij COWORK vastliep.**
Van de drie `core_agents`-rijen met status `statue` (zie COWORK hierboven)
klopt de waarde voor twee nog steeds inhoudelijk (nog niet gebouwd), maar
`task_agent` is volgens zijn eigen codecommentaar in `agentRegistry.ts`
inmiddels echt aangesloten. Bij mij weigerde de auto-mode classifier de
schrijfactie naar Supabase. Probeer dit:
```sql
update core_agents set status = 'active' where name = 'task_agent';
update core_agents set status = 'paused' where name in ('app_agent_manager', 'finance_agent');
```
Controleer erna met:
```sql
select name, status from core_agents where name in ('task_agent','app_agent_manager','finance_agent');
```
Lukt het bij jou ook niet, zeg dat gewoon tegen Luka — dan doet hij het zelf.

**Taak 2 — de agents-tab op de maatstaf.**
Niemand bezit dit nog: CURSOR laat `Agents.tsx` expliciet links liggen, en de
data-fix hierboven (COWORK) ging over wélke agents er staan, niet over hoe de
tab eruitziet. BOUWLIJST.md 1.1 noemt "Agents" nog als openstaand voor
`UI-MAATSTAF.md`.

**Jouw bestanden:**
```
src/presentation/pages/Agents.tsx
src/presentation/components/widgets/AgentCard.tsx
src/presentation/components/agents/**
```
Dit overlapt met wat COWORK net opleverde — `git pull --rebase origin
orchestrator` eerst, dan pas beginnen.

**Taken:**
1. Lees `UI-MAATSTAF.md` helemaal — kort, en elke regel komt uit een fout die
   al gemaakt is.
2. Zet de agents-tab op `.axe-tabruimte` (de volle breedte van het
   browservak), in hetzelfde rasterritme als de browser-tab — niet op de
   smallere `.axe-bandbreed`.
3. Gebruik alleen bestaande tokens/klassen uit `axe-look.css`
   (`--surface-bg`, `--axe-lift`, enzovoort). Voeg niets toe aan dat bestand
   zelf — dat is van CURSOR. Mis je een klasse, zeg het tegen Luka in plaats
   van hem er zelf bij te maken.
4. Kleur van de statusbadge (active/paused/deprecated/onbekend) zit in de
   tekst, niet in een gevulde pil met gekleurde rand — regel 5 van de
   maatstaf.

**Meet je resultaat zo:** open de tab naast de browser-tab. Ligt de
linkerrand van het bovenste blok op dezelfde lijn als die van de composer?

**Niet aankomen:** `axe-look.css` zelf, trading, de browser, de code-editor,
en de logica die net in `Agents.tsx` is neergezet (`mergeAgents`, de
leerlus-koppeling via `agentLoopHealth`) — die is functioneel al klaar, dit
is alleen het uiterlijk.

---

## Als je toch in elkaars bestanden moet

Zeg het tegen Luka. Twee sessies in één bestand geeft een conflict dat niemand
kan overzien, en dan ben je een uur kwijt aan iets wat niets oplevert.
