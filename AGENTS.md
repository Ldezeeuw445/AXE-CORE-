# AXE CORE — lees dit eerst

Je werkt aan AXE CORE: Luka's desktop-app (Tauri + React) met een
Python-backend op een eigen VPS. Eén gebruiker, hijzelf. Geen klanten, geen
team, geen abonnementen.

Dit bestand bestaat omdat Luka met meerdere assistenten tegelijk werkt —
Claude Code, Cursor, Cowork. Nemen jullie verschillende dingen aan, dan bouwen
jullie langs elkaar heen.

Het begint met waar Core naartoe gaat, want zonder dat optimaliseert elke
sessie voor "niets slopen" in plaats van "Core meer maken wat het moet zijn".
Daarna staat wat goed werk hier is, en pas daarna wat er stukgaat. Die
volgorde is met opzet: de vallen onderaan zijn duur en echt, maar ze zijn geen
doel.

---

## Waar dit naartoe gaat

Luka's eigen woorden, 5 november 2026: Core moet zijn **tweede brein en
co-founder** zijn. "Een soort van super AI, OS3, Jarvis, maar dan nog meer
kunnend of ruimer." Concreet, en in deze volgorde van belang:

1. **Een live spraakgesprek met AXE**, dat hij doorgeeft aan de manager van de
   app of het bedrijf waar het over gaat. Niet een chatbot met een microfoon:
   een gesprek waarin AXE werk uitzet en terugkoppelt.
2. **Managers die echt kunnen bouwen.** Elke manager moet voor zijn eigen app
   kunnen programmeren en automatiseren — "zoals jou of zoals Cursor in AXE
   Core" — en moet om hulp kunnen vragen als hij vastloopt. Een manager die
   alleen status rapporteert is niet af.
3. **Core is de fabriek voor de andere twee apps.** AXE Companion
   (axecompanion.com) en Trading OS (tradingosapp.com) worden uiteindelijk
   vanuit Core afgemaakt en bijgehouden. Core zelf wordt nooit een product:
   geen abonnementen, geen tweede gebruiker.
4. **24/7 en uit zichzelf.** Aware, adaptief, lerend. Hij hoort dingen op te
   merken en voor te stellen in plaats van te wachten tot er iets gevraagd
   wordt. Daar hangt ook AXE Algo aan: een handelsagent die zelf beslist.
5. **Northsea Commodity Partners** (Luka's bedrijf, geen app) loopt via de
   NorthSea-desk en drie CrewAI-crews.

Wat dat betekent voor jouw beurt: **laat Core capabeler achter, niet alleen
heel.** Een beurt die alleen de poorten groen houdt is een gemiste beurt — en
een beurt die iets bouwt dat door niemand wordt aangeroepen is erger dan niets
(zie val 2). Zie je onderweg iets dat beter, makkelijker of slimmer kan: zeg
het, of doe het als het binnen je taak past. Niet wachten tot het gevraagd
wordt.

Wat AXE Core precies ís — het product, de tabs, de handel, het geheugen, de
schrijfstijl — staat in `brain/`, in gewone taal. Vier korte bestanden. Lees ze
voor je aan een taak begint die verder gaat dan één regel verzetten.

## Wat goed werk hier is

Vier normen. Ze zijn allemaal een keer duur geleerd.

**Bewijs, geen aanname.** "Het staat in de code" is geen bewijs dat het
draait. Meet het: een test die faalt zónder je wijziging, een meting, een
screenshot. Een nieuwe check die niet omvalt tegen de oude code bewijst niets
en geeft alleen een gevoel van zekerheid.

**Aangesloten of niet gebouwd.** Core's grootste ziekte is code die bestaat,
getest is, en door niemand wordt aangeroepen — `dodeCode.test.ts` hield er in
september 295 bij. Bouw je iets nieuws, sluit het dan in dezelfde beurt aan op
de plek waar Luka het gebruikt. Kan dat niet, bouw het dan nog niet.

**Eén ding op één plek.** Twee agents die hetzelfde doen, twee knoppen voor
één handeling, twee bestanden die `main.py` heten: dan moet iedereen daarna
raden. Vind je een tweede kopie van iets dat je nodig hebt, voeg ze dan samen
in plaats van er een derde bij te zetten.

**Zeg wat je niet weet.** Een eerlijk "geblokkeerd, want X" is bruikbaar. Een
onterecht vinkje is erger dan geen vinkje. Meld ook wat je *niet* kon
verifiëren — een Tauri-build draait bijvoorbeeld niet in een cloudcontainer,
dus een Rust-wijziging is daar hoogstens syntactisch gecontroleerd.

## Eén lijn, twee Macs, één app (Luka, 25 sep)

Luka wil geen takken, commits of pull requests zien. Alleen: gedaan, en te zien
in de app.

- **Werk af = in `orchestrator`.** Tests groen → `git push origin HEAD:orchestrator`.
  Geen werk achterlaten op een eigen tak, geen PR, geen "wil je dat ik merge?".
  Een sessietak mag als wachtkamer, maar is leeg als je klaar bent.
- **Beide Macs bouwen zichzelf.** `com.axe.autosync` (`scripts/axe-autosync.sh`)
  draait elke 5 minuten op de Mac mini én de iMac: pusht eigen commits, haalt
  nieuwe binnen en bouwt/installeert `/Applications/AXE CORE.app` als de
  build-stempel niet de huidige commit is. Handmatig bouwen hoeft niet meer.
- **Controleren:** Home toont `build <sha>`; op beide Macs hetzelfde. Log:
  `~/Library/Logs/axe-autosync.log`.
- Dezelfde app, dezelfde mogelijkheden. De Mac mini blijft het brein (lokale
  API :8001, planner); de iMac-app praat daar via Tailscale mee. Start op de
  iMac geen tweede axe_api.

**Pushen is dus deployen.** Er zit geen review tussen jouw push en de app op
Luka's bureau. Dat is de reden dat de meetlat hieronder niet optioneel is.

## Waar je bent

| | |
|---|---|
| Repo | `/Users/luka/AXE-CORE-` |
| App-code | `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/` |
| Tak | `orchestrator` — dit is main, er is geen andere |
| App op de Mac | `/Applications/AXE CORE.app` |
| VPS | `api.axecompanion.com` (212.227.91.79) |

De repo-root is misleidend: alles buiten `AXE-CORE-ORCHESTRATOR-content/` is
vorige generatie (één bulk-commit van 31 oktober, plus een mee-gecommitte zip
en een paar bijna-lege stellagemappen). Het echte systeem staat in die ene map
en is netjes gelaagd. Verwar de verpakking niet met de inhoud.

## Zes vallen die geld hebben gekost

**1. Er zijn drie bestanden die `main.py` heten. Eén draait.**
De backend die draait komt uit `backend/axe_api/main.py`. Bewerk je een andere,
dan verandert er niets en lijkt je werk verdwenen. Controleer altijd met
`python3 scripts/vps_sync.py check` — die zegt IN SYNC of hij noemt het bestand.

**2. Een grep op `src/` bewijst niet dat iets draait.**
Vijf keer op één dag bleek code te bestaan, getest te zijn, en door niemand te
worden aangeroepen. Groene tests bewijzen dat een functie werkt, niet dat iemand
hem gebruikt. Zoek de aanroeper, of doorzoek de gebouwde bundel in `dist/`.

**3. Dezelfde regel staat vaak twee keer.**
`axe-look.css` is 2300 regels; tokens staan er soms drie keer, honderden regels
uit elkaar. Verander je de bovenste en zie je geen verschil, zoek dan naar een
tweede. Er staan tests op (`plaatTint.test.ts`, `railBreedte.test.ts`).

**4. De VPS valt om als ollama te veel geheugen pakt.**
7,7 GB, en OpenHands laadde er een model van 4,9 GB in. Nu begrensd met swap en
een cgroup-limiet. Valt hij tóch om: `cat /sys/fs/cgroup/system.slice/ollama.service/memory.events`.

**5. In de gebouwde app gaat élke provideraanroep via de VPS.**
Niet rechtstreeks naar OpenAI of Anthropic. Een fout als "Proxy HTTP 502" komt
dus van jouw VPS, niet van de provider.

**6. Werk in je eigen worktree, niet in de gedeelde map.**
`WERKVERDELING.md` verdeelt bestanden, en dat werkt: niemand zit in andermans
code. Maar het verdeelt niet de git-index, en dáár ging het vier keer mis op
één dag. Een half afgemaakte `git am` hield drie sessies tegelijk op; een
`index.lock` blokkeerde een commit; iemands `git commit -a` veegde de
wijzigingen van een andere sessie mee; en een `git stash` pakte bijna
andermans bestand op. Bestandseigendom voorkomt bewerkingsconflicten, geen
git-conflicten.

Eigen map, eigen index, eigen sloten — op de externe SSD, want intern is maar
4 GB vrij en `node_modules` is 1,1 GB per worktree:

```bash
git worktree add /Volumes/EagetSSD/axe-worktrees/<sessie> -b sessie/<naam> origin/orchestrator
```

**Push altijd met `HEAD:orchestrator`.** Dit is de regel die miste. Een
worktree dwingt een eigen tak af, en dat is precies wat misging toen een
sessie op `fix/research-report-save` zat: `git push origin orchestrator`
duwde een tak die achterliep en meldde "up-to-date" terwijl er niets aankwam.

```bash
git fetch origin orchestrator && git rebase origin/orchestrator
git push origin HEAD:orchestrator
```

Het pushdoel staat daarmee vast, ongeacht hoe je lokale tak heet. De sessietak
is een wachtkamer en gaat nooit als zichzelf naar de remote, dus werk kan er
niet in blijven staan.

**Werkt er maar één sessie aan Core, dan mag die overal komen.** Luka op
5 november: "jij bent nu de enige die eraan werkt dus je mag heel axe core
alles wat moet doen van mij." `WERKVERDELING.md` is er voor wanneer het er
weer meer zijn — kijk daar dus eerst of er iemand anders loopt.

## De meetlat: wat je draait voor je zegt dat iets klaar is

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
npx tsc --noEmit          # 3 fouten — voeg er geen toe. LET OP: niet hetzelfde
                          # als `npm run typecheck`, zie hieronder
npx vitest run            # 3245 tests, 430 bestanden; 1 staat al rood
npm run lint              # poort t.o.v. eslint-baseline.json — faalt alleen op NIEUWE vondsten
npx eslint src            # volle backlog (~443 fouten, 34 waarschuwingen); na een echte fix: npm run lint:baseline
python3 scripts/vps_sync.py check   # box en repo eens
```

**Deze getallen zijn een meetlat, geen wens** (gemeten 5 nov 2026 op
`4e8cbe0`). Ze stonden lang op 733 en 427 terwijl het er 2203 en 457 waren, en
dan is "is het nog groen?" niet meer te beantwoorden: je ziet rood en weet niet
of jij dat deed. Klopt een getal niet meer, meet opnieuw en werk het hier bij —
een meetlat die achterloopt is erger dan geen meetlat.

Lint in de bouwlus (`npm run lint`) faalt alleen op vondsten die niet in
`eslint-baseline.json` staan. De volle backlog blijft zichtbaar met
`npx eslint src`. Na een echte fix krimpt de basis met `npm run lint:baseline`;
groeien verbergt nieuwe fouten.

### De twee typechecks zijn het oneens, en dat is geen detail

`npx tsc --noEmit` geeft **3** fouten. `npm run typecheck` geeft er **18**,
want dat script draait twee configuraties achter elkaar:
`tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.json --noEmit`.

Wie dit bestand volgt ziet dus 3 en denkt dat het klopt; wie het npm-script
draait ziet 18 en denkt dat hij iets gebroken heeft. Beide zijn waar en geen
van beide is het hele verhaal. De vijftien extra zitten vrijwel allemaal in
testbestanden (`stuurAxeJobs.test.ts`, `goldOrb1amNy.test.ts`,
`agentsTab.test.ts`, `deviceNotifyToken.test.ts`, `agentMemoryHek.test.ts`,
`chatSlots.test.ts`) plus `goldOrb1amNy.ts` en `unistrokeRecognizer.ts`.

Tot iemand die achttien opruimt: **noem altijd welk commando je draaide.**
"Typecheck groen" zonder het commando erbij zegt niets.

### De rode test, bij naam

Vergelijk lijsten en geen aantallen. Er staat er nog één rood op
`orchestrator` (gemeten 5 nov). Het is een **ratel tegen verval**, geen bug:

| Bestand | Wat hij zegt |
|---|---|
| `src/domain/dodeCode.test.ts` | twee exports zonder aanroeper: `managerNaam` (`domain/agents/bossRoute.ts`), `lintUitlegVan` (`domain/taken/taakFout.ts`) |

De negentien van 30 september zijn er één geworden.
`generateArchitectureManifest` is op 5 nov gerepareerd door de snapshot
opnieuw te genereren met `AXE_WRITE_ARCHITECTURE=1`. `colourRule` stond op
129 waar er 128 mochten en is op 5 nov groen gemaakt zoals het hoort: vier
gekleurde vullingen weg uit `ObsidianMemoryPanel.tsx`, en toen het plafond
mee naar 125. Op 8 nov drie vullingen weg uit `tradingIntel/StatusStrip.tsx`
en het plafond naar 122.

Dat waren vijf schendingen in dat bestand en de teller zakte met drie. Dat is
geen half werk: de detector leest 60 tekens dóór na `background:`, dus een
gekleurde *rand* op dezelfde regel telt mee als vulling. Een rand mag kleur
dragen. De uitleg staat bij `CEILING` in de test — lees die voor je aan de
volgende veegronde begint, want anders ga je eigenschappen verschuiven om de
teller te laten zakken en verandert er niets op het scherm.

**Een ratel repareer je nooit door het plafond te verhogen.** De kleurtest
zegt het zelf: hij gaat alleen omlaag. Staat hij één boven zijn plafond, dan
is er één schending bijgekomen en moet er één weg. Haal je er vier weg, zet
`CEILING` dan ook vier lager — anders mogen die vier stil terugkomen en heb
je alleen jezelf een goed gevoel gegeven.

Hoe je vergelijkt:

```bash
npx vitest run 2>&1 | grep FAIL | sort -u > /tmp/na.txt
git stash && npx vitest run 2>&1 | grep FAIL | sort -u > /tmp/voor.txt && git stash pop
diff /tmp/voor.txt /tmp/na.txt     # leeg = jij brak niets
```

`robustness.test.ts > walk-forward` valt onder volle belasting soms om op de
5 s-limiet (los duurt hij ~4 s). Dat is timing, geen breuk — draai hem apart
voor je hem meetelt.

De suite draait zonder DOM, met opzet (`vitest.config.ts`: node, geen jsdom).
Een gedraging in een component toets je dus niet door te renderen maar door de
logica in `domain/` te zetten en die te toetsen, of door de bron te lezen zoals
`vensterSchaduw.test.ts` doet. Dat is geen beperking om omheen te werken: het
dwingt de beslissing uit de JSX en in een laag waar je hem kunt nalezen.

Bouwen en installeren:
```bash
npm run tauri:build
cp -R src-tauri/target/release/bundle/macos/"AXE CORE.app" /Applications/
```

Systeemstatus, van overal:
```bash
axe-status
```

## De regels waar Luka op let

**Nederlands in commits en commentaar.** Engels in de UI.

**Leg in commentaar uit wáárom, niet wat.** Een commentaar dat vertelt wat de
regel eronder doet, veroudert en liegt. Een commentaar dat vertelt welke fout
er zat en hoe die zich voordeed, voorkomt dat iemand hem terugdraait. Zie de
notities bij `shadow: false` en `--axe-notch-h` voor de toon.

**Kleur zit in letters, niet in vlakken.** Zie `UI-MAATSTAF.md` en
`colourRule.test.ts`: een rood woord lees je, een rood vlak is decoratie die
toevallig bij het woord staat.

**Bij een klacht over uiterlijk: kijk eerst naar het scherm.** Luka's "het is
te donker" of "hij staat te laag" gaat bijna nooit over waar jij hem in de CSS
zoekt. Playwright staat klaar (`/opt/pw-browsers/chromium`, `--no-sandbox`);
twee minuten meten scheelt een hele verkeerde ronde.

**AXE is de baas, niet een chatbot.** Elke beurt (typen of stem) gaat door
de tier-router: 1 = regels + opgeslagen data, 2 = klein snel model, 3 =
bestaande agent op de achtergrond. Meerdere taken in één zin worden
geknipt en lopen parallel; de chat wacht daar niet op. De classifier
schrijft geen antwoord. Timeout of fout → het pad dat er al was. Stem:
eerste complete zin speelt terwijl de LLM nog tokens stuurt; barge-in
stopt TTS; de orb volgt mic en afspeelniveau. De vier fases staan in
`BOUWLIJST.md` §6 — verwar deze tiers niet met de roster-tiers in
`roster.ts`.

### UI-regel — één inhoudsruimte, inhoud bepaalt de maat

De Browser-tab is de meetlat. Elke andere tab gebruikt dezelfde schil-primitieven
(`TabRuimte`, `Kaart`, `SectieBlok`, `SchuifBalk` in
`src/presentation/components/layout/tabMaatstaf.tsx`). Geen eigen raster, geen
eigen kaartmateriaal, geen eigen ladevorm. Uitwerking en hoe je het meet: het
hoofdstuk **De vijf layoutregels** in
`AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/UI-MAATSTAF.md`.

1. **Eén vaste inhoudsruimte.** Dat is het vak dat de Browser-plaat inneemt
   als er een domein open is (NorthSea-desk gebruikt precies dat vak, zonder
   plaat). Dezelfde marges tot de schilranden, de composer en het dock, op
   elke tab. Alleen via `TabRuimte` / `.axe-tabruimte`.
2. **Die ruimte is een MAXIMUM, geen doel.** Inhoud bepaalt de maat. Kaarten
   groeien met hun inhoud; kaarten van hetzelfde type zijn even groot op één
   raster. Nooit een kleine kaart oprekken tot de rij vol is, nooit een zware
   kaart platdrukken. Wat de ruimte niet vult, blijft gecentreerd met lucht
   (Browser-home: drie composers boven het snelkoppelingenraster). Alleen wat
   het écht nodig heeft vult het hele vak: een website, de NorthSea-kaart, de
   agenda, grote tabellen.
3. **Kaarten zijn matzwart.** Zelfde materiaal als de kaarten op Browser-home:
   `Kaart` / `.axe-kaart`, tokens `--axe-kaart-*`. Dunne lichte rand (~1px,
   wit met lage dekking, bovenrand iets helderder) plus een zachte donkere
   schaduw — leesbaar tegen donker bureaublad achter de transparante schil,
   en zwevend in de lichte stand. Subtiel; geen gekleurde neongloed.
4. **Secties** gebruiken het blok van de Agents-tab (WAR ROOM / WINGMAN'S
   CREW): `SectieBlok` / `.axe-sectie`.
5. **Linker schuifbalken** hebben per tab eigen inhoud, maar dezelfde vorm
   als de Browser-lade: binnenkaart met vaste afstand tot de rand, gegroepeerde
   secties, Settings + Profile onderaan. `SchuifBalk` / `.axe-schuifbalk`.

Tegenvoorbeeld: drie stat-kaarten oprekken tot volle-breedte-balken, of
serverkaarten in een krappe 1fr-rij proppen. Dat is de oude MCP-tab.

Composer, chat, voice en AICore horen hier niet bij — die hebben een eigen
spoor. Alleen stijl en indeling; geen data, hooks, stores of API.

## Supabase — nieuwe tabellen vanaf 14 oktober 2026

Maak migraties met `supabase migration new`. Elke nieuwe tabel in `public`
moet in dezelfde migratie RLS inschakelen én expliciete, minimale `GRANT`-rechten
voor de bedoelde rollen krijgen. Server-only betekent alleen `service_role`;
geef niet automatisch `anon` toegang. Clienttoegang vereist passende policies.
Bij sequences ook de benodigde sequence-rechten opnemen. Test de echte rollen
na toepassing. `supabaseMigrationAccess.test.ts` bewaakt nieuwe tabelmigraties
statisch; dat is geen volledige SQL-parser of bewijs van veilige policies.
Supabase stopt op 30 oktober met impliciete rechten voor nieuwe public-tabellen.
Bestaande rechten niet massaal wijzigen; bestaande tabellen behouden hun grants.

## Waar de rest staat

De meeste van deze bestanden staan **niet** naast dit bestand maar in de
app-map (`AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`). Dat scheelt
je een zoektocht, dus het staat er per regel bij.

| Bestand | Waar | Waarvoor |
|---|---|---|
| `brain/` | hoofdmap | wat AXE Core is, en wat waar blijft — lees dit eerst bij echt werk |
| `docs/CREWAI-REFERENCE.md` | hoofdmap | CrewAI-naslag |
| `os3/` | hoofdmap | Skill AXE + SETUP. CLI + hek bovenop bestaande workers. OS3 optioneel. |
| `BOUWLIJST.md` | app-map | wat af is, wat niet, in welke volgorde |
| `UI-MAATSTAF.md` | app-map | hoe een tab eruit hoort te zien — de browser-tab is de meetlat |
| `SLEUTELS.md` | app-map | waar elke sleutel woont |
| `ECOSYSTEM.md` | app-map | alle apps, repo's, VPS'en, hoe ze uitrollen |
| `WERKVERDELING.md` | app-map | wie waaraan werkt, en welke bestanden van wie zijn |
| `docs/MISSIES-EN-DAX.md` | app-map | missies (agents werken door zonder "ga door"), DAX-computers op STRATO, eeuwig AXE-gesprek, echte agentstatus |
| `docs/programma/` | app-map | het productprogramma: de vijf masterspecs als canon, wat er echt draait, gapmatrix, taken (`programma.json`), incidenten. Lees dit vóór je aan een van de vijf producten begint |

**`ARCHITECTURE.md` bestaat twee keer en de twee zijn niet hetzelfde.** Die in
de app-map (178 regels, "AXE — the shape it should have") gaat over het systeem
dat draait; die in de hoofdmap (144 regels, "God Mode Architecture") hoort bij
de bevroren generatie van 31 oktober. Neem de app-map. Dit is val 3 in
documentvorm — en de reden dat de kolom hierboven bestaat.

## Architectuur: CLI bovenop wat er al is

AXE is interface, persoonlijkheid en geheugen. Uitvoering op Luka's
machines bestaat al: `infra/computer-worker` (launchd),
`infra/claude-local-worker`, durable kernel (`core_tasks`), leerlus +
RAG (`rag_memories`, `agent_learning_episodes`). De `axe`-CLI en het
hek (`cli_laag.py`) zitten daar bovenop. Geen tweede node-daemon, geen
tweede geheugenstore. Inventaris: bouwlijst §8.

Rabbit OS3 is een optionele extra executor via dezelfde CLI. Er is geen
publieke OS3-API; OS3 belt AXE, niet andersom. Staat sinds 25 sep in
`orchestrator`; zonder OS3-koppeling doet de laag niets.

Dit bestand staat in de hoofdmap omdat elke assistent het daar als eerste leest.
Klopt er iets niet meer, verander het hier — niet in je eigen sessie-geheugen.
Dat geldt ook voor de richting bovenaan: zegt Luka iets nieuws over waar Core
heen moet, dan hoort dat hier te staan en gaat het boven alles eronder.
