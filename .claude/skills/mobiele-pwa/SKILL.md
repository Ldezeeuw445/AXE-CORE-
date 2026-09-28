---
name: mobiele-pwa
description: Een AXE CORE-tab goed maken op Luka's iPhone (de PWA op axeheadquarters.com) zonder dat de Tauri-app verandert. Gebruik dit bij ELK mobiel/PWA-werk aan AXE CORE — "maak tab X goed op mobiel", "afgesneden", "onderkant klopt niet", "ruimte tot de home-indicator", glasplaat, composer, safe-area, notch, statusbalk, iPhone-screenshot van de app — ook als Luka alleen een screenshot stuurt en "fix dit" zegt. Bevat de iOS 26-viewportbug die acht commits kostte, de plaatgeometrie, en een script dat de tab op echte iPhone-maten meet en afbeeldt in plaats van te gokken.
---

# Mobiele PWA-tabs op de iPhone

Luka gebruikt AXE CORE op zijn iPhone als geïnstalleerde PWA van
`axeheadquarters.com`. Dezelfde React-code draait in de Tauri-app op de Mac.
De opdracht is altijd twee dingen tegelijk: **de telefoon goed**, en **Tauri
op de pixel ongewijzigd**. Een wijziging die op de telefoon klopt maar de
Mac-app verschuift is niet af.

Lees eerst `AGENTS.md` in de repo-root (werkwijze, bewijsregel, push).

## De fout die je eerst moet uitsluiten: iOS 26 en de statusbalk

Op iOS 26 heeft een geïnstalleerde PWA met
`apple-mobile-web-app-status-bar-style = black-translucent` + `viewport-fit=cover`
een venster dat **één statusbalk te kort** is (WebKit bug 301108). De app
tekent vanaf de bovenrand, maar alleen tot `scherm − statusbalk`; daaronder
ligt een band die geen CSS kan bereiken. Op Luka's iPhone (402×874): getekend
tot 812, daaronder 62pt zwart. `100dvh`, `100%`, `innerHeight` en
`visualViewport.height` zijn daar allemaal 812 — dus elke berekening "vanaf
de onderkant" landt 62pt te hoog, en iets wat verder reikt wordt recht
afgesneden.

Herken hem aan: een **rechte** snijlijn door plaat/composer, of een zwarte
band onderin die precies zo hoog is als de statusbalk.

Daarom staat `index.html` op `black` (niet translucent). Het venster begint
dan onder de statusbalk en loopt door tot de onderrand. Twee gevolgen:

- iOS leest die tag **alleen bij installeren**. Na een wijziging eraan moet
  Luka de app van het beginscherm halen en opnieuw toevoegen; anders ziet hij
  niets veranderen. Zeg dat erbij.
- Zet hem niet terug naar `black-translucent` om "de achtergrond onder de
  statusbalk" te krijgen — dat haalt de dode band terug. `mobileEntry.wiring.test.ts`
  bewaakt dit.

### De kleur van de statusbalk

iOS 26 negeert `theme-color`. De balk krijgt zijn kleur van de pagina, en
dat op een moment dat jij niet kiest: bij het opstarten, en daarna pas weer
als er iets verandert. Twee dingen moeten dus kloppen:

- **`html`/`body` zwart in de iPhone-app.** Ze staan in `axe-look.css` op
  transparent voor het Mac-glas; `index.html` zet `data-ios-pwa` (alleen als
  `navigator.standalone === true`) en `axe-look.css` maakt ze daar `#000`.
- **Geen lichte flits bij het opstarten.** `DEFAULT_LOOK` is `glass` (licht).
  Staat de look niet lokaal, dan start de app licht tot de cloud antwoordt,
  en precies dan leest iOS de balk af: lichtblauw (`#D5E6F4`/`#B4C9DD`, dat is
  de `LICHT`-lucht uit `MobileGlass.tsx`). `lookUitCloud` in `useLook.ts`
  bewaart de cloud-stand daarom ook lokaal.

Balk lichtblauw bij het openen en zwart na het wisselen van look? Dan is het
die flits, niet de CSS.

Correctie 28 sep: `body` alleen was niet genoeg. iOS leest de kleur van het
**vaste element bovenaan de pagina**, en herziet hem alleen als zo'n element
verschijnt of verdwijnt (de zijlade open/dicht deed het; van look wisselen
niet altijd). Daarom staat er in `index.html` een vaste zwarte strook
`#axe-ios-balk` (volle breedte, 2px, bovenop alles, alleen bij `data-ios-pwa`),
aanwezig vanaf de eerste frame, en start een verse installatie in `black`.

## Canvas op de telefoon: resolutie en maat

Luka's iPhone is 3x. Een canvas met `Math.min(devicePixelRatio, 2)` wordt door
iOS 1,5x opgerekt en oogt wazig. En wat op de desktop groot genoeg is, kan op
de telefoon over elkaar vallen: de sphere had deeltjes tot 7pt breed op 4,5pt
van elkaar. `AxeCoreSphere telefoon` tekent daarom op 3x, schaalt de deeltjes op
hun onderlinge afstand en tekent ze als voorgetekende lichtpuntjes. Meet een
canvas met `canvas.width` tegen zijn CSS-maat, en vergelijk een uitsnede op
ware pixels, vóór en na.

## De basis van elke tab op de telefoon (Luka, 28 sep)

Bovenin: hamburger links, de balk van de tab in het midden, licht/donker
rechts (AppShell zet hamburger en licht/donker al neer). Onderin: de composer.
Daartussen: de inhoud van de tab over de **hele plaat**, niet in een vak.
Zijwidgets gaan **in de laden**, niet naast of over de inhoud.

Zo is het gebouwd, en zo hergebruik je het:

- **Laden** (`ladeSloten.ts` + `LadeSlot.tsx`): op de telefoon krijgen
  `#axe-slot-links` en `#axe-slot-rechts` een gastheer die buiten React
  geparkeerd staat en de linker-/rechterlade in schuift zolang die open is. Wat
  een tab via `PlaatSlot slot="links|rechts"` of `useSlotAdoptie` aanlevert,
  komt dus vanzelf in de lade; desktop houdt zijn eigen `PlaatSlotHosts`. Een
  Radix-Sheet haalt dicht zijn inhoud weg, daarom de parkeerplaats.
- **Hele plaat** (slot `wereld`): AppShell zet op de telefoon-Home een laag
  over de volle plaat neer, áchter alles. Het midden laat aanraking door
  (`pointer-events: none` op de schil-inhoud); de balk en de composer zetten
  het terug op `auto`. Test dat met `elementFromPoint` in het midden én op
  de knoppen.
- Zijkolommen die een tab onder een breedte verbergt (Terrain onder 900px)
  zet `.axe-slot--lade` weer aan; kijk of een widget in de lade 0 hoog is.
- In de emulator opent een veeg vanaf de rand "terug" en verlaat hij de app;
  open de laden met `.axe-railtoggle--l/--r`. Op de iPhone-app bestaat dat
  terug-gebaar niet. Twee WebGL-scènes tegelijk (Terrain + zijn miniatuur in
  de rechterlade) maken de GPU-loze emulator traag: een lade die pas na 13 s
  sluit is daar geen bug, meet het met een wachtlus i.p.v. een vaste pauze.

## Een wereld of paneel dat de balk afdekt

Staat er iets `absolute` in een mobiel vak zonder `position: relative` erom,
dan rekt het zich uit tot de hele `.axe-mobile-home` en ligt het over de
knoppen. Terrain deed dat: na één keer Terrain werkte geen wereldknop meer.
Test het met `document.elementFromPoint` op de knoppen ná de wissel, niet
alleen ervoor.

## Geometrie van Luka's telefoon

Gemeten op zijn screenshot (iPhone 16/17 Pro, @3x):

| | pt |
|---|---|
| scherm | 402 × 874 |
| statusbalk (= top-inset bij translucent) | 62 |
| safe-area onder | 34 |
| home-indicator | y 861–866, x 129–273 (8–13pt boven de rand) |
| schermhoek | ~55 radius |

Met `black` is het venster 402 × 812, begint het op y=62, en is
`env(safe-area-inset-top)` 0 en `env(safe-area-inset-bottom)` 34.

De Home-plaat (`/mobile`) staat op: boven `inset-top + 2px`, zijkanten 12px,
onder `max(14px, calc(env(safe-area-inset-bottom) - 12px))` — 22pt boven de
rand, 9pt lucht tot de streep. Composer: 11pt boven de plaatrand, gelijk aan
de bovenmarge. Houd nieuwe tabs op dezelfde maten tenzij Luka iets anders
vraagt; één maat voor elke tab is de regel uit `UI-MAATSTAF.md`.

## Waar de mobiele indeling zit

- `src/presentation/components/layout/AppShell.tsx` — `mobileCommandSurface`,
  `opPlaatMobiel`, en de inline-stijl van de glasplaat (`.axe-plaat-mobiel`).
  De `/mobile`-takken daarin zijn de telefoon-Home.
- `src/presentation/pages/MobileSystem.tsx` — de Home zelf (`/mobile`),
  flex-kolom, composer onderaan met `mt-auto`.
- `src/presentation/components/layout/MobileComposer.tsx`, `MobileChat.tsx`, `MobileNav.tsx`.
- `src/design/axe-look.css` — mobiele regels onder `@media (max-width: 640px)`
  en `.axe-mobile-home`. Val 3 uit `AGENTS.md`: regels staan er soms twee keer.
- `index.html` — viewport-meta en statusbalk. `public/manifest.json` start op `/#/mobile`.
- Wiring-tests: `src/presentation/pages/MobileSystem.wiring.test.ts`,
  `src/app/mobileEntry.wiring.test.ts`. Die lezen de bron als tekst; werk ze
  bij in dezelfde commit, anders staat orchestrator rood (gebeurde 27 sep).

## Tauri ongemoeid laten

De Tauri-app raakt deze code op twee manieren:

1. Het hoofdvenster: `opPlaatMobiel` is daar false. Scope mobiele wijzigingen
   dus achter `mobileCommandSurface` / `opPlaatMobiel` / de `/mobile`-route
   of de 640px-media query — nooit in een gedeelde regel.
2. **De zwevende telefoon** (`ZwevendeTelefoon`) laadt `/mobile` in een iframe
   van 393px, zonder safe-area. Een formule met `env(safe-area-inset-*)` moet
   bij inset 0 dezelfde waarde geven als voorheen — vandaar de `max(14px, …)`.

Bewijs het met `--tauri` hieronder, vóór en na: geometrie gelijk.

## Werkwijze

1. **Meet Luka's screenshot eerst.** Zoek de snijlijn en de zwarte band met
   Pillow (`pip install pillow`); deel door 3 voor punten. Is de band precies
   de statusbalk, dan is het de iOS-bug en niet je CSS.
2. **Start de dev-server** (de config eist `PORT`):
   ```bash
   cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
   PORT=5199 npx vite --config vite.config.ts --host 127.0.0.1 --port 5199 --strictPort
   ```
   `?ontwerp=1` slaat in dev het inloggen over (`ontwerpModus.ts`); het script doet dat zelf.
3. **Meet vóór je iets verandert**, met het script (Playwright staat globaal):
   ```bash
   export NODE_PATH=$(npm root -g)
   S=.claude/skills/mobiele-pwa/scripts/meet-telefoon.cjs
   node $S --route /mobile --uit voor.png                    # telefoon zoals nu
   node $S --route /mobile --statusbar translucent --uit bug.png   # de iOS 26-bug nabootsen
   node $S --route /mobile --tauri --uit tauri-voor.png      # zwevende telefoon in Tauri
   node $S --route /tasks --look glass --selector '.axe-tabruimte' --uit tasks.png
   ```
   Uitvoer: JSON in schermcoördinaten (`plaat`, `composer`, `ruimte.plaatTotStreep`,
   `ruimte.getekendTot`) en een PNG van het hele scherm met statusbalk,
   home-indicator en ronde hoeken. Bekijk die PNG — hij laat zien wat Luka ziet.
4. **Verander, meet opnieuw**, zet de getallen in een tabel voor Luka.
   Pixel-diffs tussen opnames zijn ruis rond de sphere en de composer-gloed
   (animaties); vergelijk geometrie en statische uitsneden, niet het hele beeld.
5. **Checks** (vanuit de app-map): `npx tsc --noEmit`, `npx vitest run`,
   `npx eslint <gewijzigde bestanden>` vóór en na vergelijken, en
   `npm run build:web` — dat is wat Cloudflare draait.
6. **Push** met `git push origin HEAD:orchestrator`. Cloudflare Pages bouwt
   `axeheadquarters.com` vanaf orchestrator; na ~2 minuten staat het live.
   Controleer het echt:
   ```bash
   curl -s "https://axeheadquarters.com/?x=$RANDOM" | grep -o 'status-bar-style" content="[a-z-]*"'
   ```
   en grep de live `/assets/index-*.js` op je nieuwe regel.
7. **Zeg Luka wat hij moet doen om het te zien**: app helemaal sluiten en
   opnieuw openen (service worker), of verwijderen en opnieuw toevoegen als
   `index.html`-meta veranderde.

## Wat het script niet kan

Chromium is geen WebKit. Het bootst de safe-area na, niet de iOS-bug zelf
(`--statusbar translucent` benadert hem door de onderste 62pt zwart te maken).
Een echte bevestiging is Luka's volgende screenshot; vraag erom en meet hem
met stap 1.

Tabs die data van de AXE-API halen (Tasks, Cron, …) tonen in een omgeving
zonder backend een rode `AXE API 405`-melding en een lege inhoud. De plaat en
de schil zijn dan nog te meten, de inhoud niet — zeg dat, en noem geen lege
tab een layoutfout voordat je dat hebt uitgesloten.

## Stand 27 sep

Home (`/mobile`) is af op de maten hierboven. De andere tabs gebruiken nog
`calc(env(safe-area-inset-bottom) + 10px)`: plaat tot 830, 31pt boven de
streep in plaats van 9. Dat is de eerste stap als Luka de volgende tab vraagt.
