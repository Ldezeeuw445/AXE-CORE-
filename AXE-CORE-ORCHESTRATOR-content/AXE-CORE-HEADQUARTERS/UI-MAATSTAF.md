# De maatstaf: de browser-tab

Op 8 september 2026 zei Luka over de browser-tab: *"dit is het hele UI stijl
wat ik elke keer al bedoel."* Dat is geen smaakoordeel maar een meetlat — en
tot dat moment bestond die alleen in zijn hoofd, waardoor "maak deze tab af"
elke keer opnieuw uitgelegd moest worden.

Dit bestand legt vast wat er op die tab klopt, zodat elke andere tab er
tegenaan gehouden kan worden.

## De vijf layoutregels

Dit is de regel die Luka op 24 september 2026 vastzette. Hij vervangt de oude
lezing van regel 6 ("nergens een halve pagina leeg"): lege plaat naast inhoud
is ademruimte, geen fout. De Browser-tab blijft de meetlat; de primitieven
staan in `src/presentation/components/layout/tabMaatstaf.tsx`.

**1. Eén vaste inhoudsruimte.**
Het vak dat de Browser-plaat inneemt als er een domein open is. NorthSea Desk
gebruikt precies dat vak, zonder plaat. Dezelfde marges tot de schilranden,
de composer en het dock, op elke tab. Alleen via `TabRuimte` / `.axe-tabruimte`
— dezelfde som als `.axe-browser-vak`. Geen tweede maat per pagina.

**2. Die ruimte is een MAXIMUM, geen doel.**
Inhoud bepaalt de maat. Kaarten groeien met hun inhoud; kaarten van hetzelfde
type zijn even groot op één raster (`.axe-kaart-raster`: vaste kolombreedte,
geen `1fr`). Nooit een kleine kaart oprekken tot de rij vol is, nooit een
informatie-zware kaart platdrukken om te passen. Wat de ruimte niet vult,
blijft gecentreerd met lucht — zoals Browser-home (drie composers boven het
snelkoppelingenraster). Alleen wat het écht nodig heeft vult het hele vak:
een website, de NorthSea-kaart, de agenda, grote tabellen (`vullen` op
`TabRuimte`).

De oude `.STAT_ROW` met `auto-fit … 1fr` rekt drie cijfers uit tot
volle-breedte-balken. Dat is het tegenvoorbeeld. Compacte cijfers horen in
`.axe-stat-rij`.

**3. Elke kaart is matzwart.**
Zelfde materiaal als de kaarten op Browser-home. `Kaart` / `.axe-kaart`,
tokens `--axe-kaart-vlak`, `--axe-kaart-lijn`, `--axe-kaart-lijn-boven`,
`--axe-kaart-schaduw`. Dunne lichte rand (~1px, wit met lage dekking,
bovenrand iets helderder) plus een zachte donkere schaduw, zodat de kaart
zichtbaar blijft tegen donker bureaublad achter de transparante schil en
zweeft in de lichte stand. Subtiel; geen gekleurde neongloed. `.widget-card`
leest dezelfde tokens, zodat een oude kaart niet een tweede materiaal wordt.

**4. Secties gebruiken het Agents-blok.**
Kop zoals WAR ROOM / WINGMAN'S CREW: klein, breed tracked, cream. Daaronder
de kaarten. `SectieBlok` / `.axe-sectie`. Geen Word-document van
volle-breedte-koppen.

**5. Schuifbalken links én rechts: één gedrag, eigen inhoud.**
Zelfde vorm als de Browser-lade: binnenkaart met vaste afstand tot de rand,
gegroepeerde secties, Settings + Profile onderaan waar dat logisch is.
`SchuifBalk` / `.axe-schuifbalk`, via `TabRail kant="links"` of
`TabRail kant="rechts"`. De rail levert de breedte; de binnenkaart is het
materiaal. Elke tab heeft dezelfde basis: links en rechts openen met de muis aan
de rand én met een subtiele randknop. Heeft een tab rechts nog geen eigen
context, dan blijft die lade bewust leeg in plaats van willekeurige globale
inhoud te tonen.

---

## De overige regels (materiaal, kleur, meten)

**1. De achtergrond is de plaat, en verder niets.**
Geen enkele pagina brengt een eigen achtergrond mee. Wat je door de app heen
ziet is het bureaublad, vervaagd door het native glas. Een pagina die zelf een
vlak schildert, dekt dat af — dat overkwam de browser met zijn paarse verloop.

**2. Een tab krijgt de ruimte van het browservak; vullen is geen plicht.**
Er zijn TWEE maten, en het verschil doet ertoe:

- `.axe-tabruimte` — het MAXIMUM van elke pagina. Dezelfde marges als het vak
  waarin een geladen website valt, maar zonder plaat eronder. Bij een venster
  van 1600 is dat 1280px.
- `.axe-bandbreed` — de chatplaat, de composer en de nav. Bij 1600: 1026px.

De tabruimte is de buitenrand, niet het doel. Kleine inhoud blijft gecentreerd
erbinnen (layoutregel 2). Alleen een website, kaart, agenda of grote tabel
vult het vak. De startpagina van de browser lijnt op de band uit omdat hij
vlak boven de composer staat.

`.axe-bandbreed` rekent op het VENSTER en niet op zijn ouder — anders klopt de
som niet meer zodra hij in de smallere tabruimte hangt, en dat is precies waar
hij voor bestaat.

**3. Eén rasterritme, geen losse maten.**
Drie kolommen, en rijen daaronder in datzelfde ritme. Niet één groot blok, dan
zes kleine, dan iets doorzichtigs. Wat naast elkaar hoort, deelt zijn
kolomlijnen met wat erboven staat.

**4. Elke kaart is dicht en heeft dezelfde stijl.**
Eén materiaal uit `--surface-bg`. Geen doorschijnende vlakken, geen
`opacity-80` op wat niet actief is, geen eigen achtergrond per kaart. Op licht
glas krijgen ze `--axe-lift` mee, zodat ze zweven in plaats van plat liggen.

**5. Kleur zit in de letters, niet in vlakken.**
Een modusknop die aan staat kleurt zijn tekst. Geen gevulde pil met een
gekleurde rand — dat is een knop uit een andere app. Zelfde regel als
`domain/meaning.ts`: tint mag variëren voor leesbaarheid, hue nooit voor
nadruk.

**6. Ademruimte is geen fout; scheef uitlijnen wel.**
Inhoud die het vak niet vult blijft gecentreerd (layoutregel 2). Wat wél fout
is: alles tegen één rand, of kleine kaarten oprekken tot de rij vol is. De
ruimte naast de band (`.axe-naast-band`) is gereserveerd en heeft een bewoner.

**7. Wat van ons is ligt op de plaat; wat van buiten komt krijgt een rand.**
De startpagina van de browser hoort vrij op de plaat, uitgelijnd op de band --
een vak eromheen maakt er een venster-in-een-venster van. Een geladen website
is niet van ons: die krijgt wel een vak, met marge opzij en onder, zodat hij de
chatplaat niet raakt en de schuifbalken er niet overheen vallen.

**8. Kleur die iets betekent mag nooit overschreven worden.**
De sleutel die groen is als je API-key werkt, de bel met ongelezen meldingen,
een stip die een toestand aangeeft: die dragen hun betekenis IN hun kleur. Een
regel die "alle iconen wit" zegt haalt die betekenis weg, en dat is precies wat
er op 8 september misging. Schrijf zulke regels zonder `!important`, zodat een
inline kleur wint -- en scope ze op wat je echt bedoelt in plaats van op alles
wat toevallig in dezelfde balk hangt.

## Hoe je dit meet in plaats van bekijkt

**De routes zitten in de hash.** `main.tsx` gebruikt `HashRouter`, dus de tab
die je meet staat achter een `#`:

```
http://localhost:5199/?ontwerp=1#/eve      klopt
http://localhost:5199/eve?ontwerp=1        rendert Home
```

De tweede vorm geeft geen foutmelding en geen lege pagina -- hij toont gewoon
de index-route, dus je meet Home terwijl je denkt dat je eve meet. `?ontwerp=1`
moet vóór de `#` staan, want `ontwerpModus()` leest `location.search`. Dit
kostte op 9 september een half uur en bijna een bugmelding over een scene die
over de pagina heen zou liggen.

Layoutregel 1 is een getal: de linkerrand van `.axe-tabruimte` moet gelijk
zijn aan die van `.axe-browser-vak`. In de dev-server, met `?ontwerp=1`:

```js
const vak = document.querySelector('.axe-tabruimte');
const plaat = document.querySelector('.axe-browser-vak');
// Zelfde marge tot de schil. De composer is smaller; dat is bewust.
vak.getBoundingClientRect().left === (plaat?.getBoundingClientRect().left
  ?? getComputedStyle(vak).marginLeft)
```

**Controleer eerst `window.innerWidth`.** Staat de Browser-pane verborgen, dan
is die nul en komt élke maat op nul -- dan lijkt de hele indeling ingestort
terwijl er niets aan de hand is. Dat kostte op 9 september bijna een
teruggedraaide wijziging die juist goed was.

## Hoe je een tab hiertegen houdt

Open de tab naast de browser-tab (een geladen site, niet de startpagina) en
kijk of de inhoudsruimte dezelfde randen heeft als het browservak. Zo niet,
dan mist `TabRuimte` / `.axe-tabruimte`. Kleine inhoud hoort DAARBINNEN
gecentreerd te staan, niet tot die randen opgerekt.

`plaatTint.test.ts` bewaakt dat plaatregels niet twee keer bestaan;
`railBreedte.test.ts` dat elke uitschuifbalk één breedte heeft;
`kaartMateriaal.test.ts` dat de kaarttokens en `.axe-kaart` één keer staan.
Alle drie na een dag waarin dezelfde fout vier keer terugkwam doordat een
tweede definitie de eerste stil overschreef.
