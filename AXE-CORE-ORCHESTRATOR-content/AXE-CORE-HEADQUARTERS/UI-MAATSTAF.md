# De maatstaf: de browser-tab

Op 8 september 2026 zei Luka over de browser-tab: *"dit is het hele UI stijl
wat ik elke keer al bedoel."* Dat is geen smaakoordeel maar een meetlat — en
tot dat moment bestond die alleen in zijn hoofd, waardoor "maak deze tab af"
elke keer opnieuw uitgelegd moest worden.

Dit bestand legt vast wat er op die tab klopt, zodat elke andere tab er
tegenaan gehouden kan worden.

## De zes regels

**1. De achtergrond is de plaat, en verder niets.**
Geen enkele pagina brengt een eigen achtergrond mee. Wat je door de app heen
ziet is het bureaublad, vervaagd door het native glas. Een pagina die zelf een
vlak schildert, dekt dat af — dat overkwam de browser met zijn paarse verloop.

**2. Alles ligt binnen de bandbreedte.**
De chatplaat, de composer en de nav delen één uitgerekende breedte
(`.axe-bandbreed`). Wat daarboven staat gebruikt diezelfde klasse. Niet
"ongeveer dezelfde padding" — letterlijk dezelfde som, want de band is
gecentreerd en geen 100% breed.

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

**6. Er blijft nergens een halve pagina leeg.**
Als alles links staat en rechts alleen de plaat, klopt de indeling niet. De
ruimte naast de band is de uitzondering die de regel bevestigt: die is
gereserveerd (`.axe-naast-band`) en heeft een bewoner.

## Hoe je een tab hiertegen houdt

Open de tab naast de browser-tab en kijk of de linkerrand van het bovenste blok
op dezelfde lijn ligt als die van de composer. Zo niet, dan mist
`.axe-bandbreed`.

`plaatTint.test.ts` bewaakt dat plaatregels niet twee keer bestaan;
`railBreedte.test.ts` dat elke uitschuifbalk één breedte heeft. Beide zijn
geschreven na een dag waarin dezelfde fout vier keer terugkwam doordat een
tweede definitie de eerste stil overschreef.
