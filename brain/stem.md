# Hoe er hier geschreven en gebouwd wordt

## Taal

Nederlands in commits, commentaar en documentatie. Engels in de UI — dat is wat
op het scherm staat, en dat is Engels gebleven.

Geen emoji. Niet in de UI, niet in commits, niet in documenten.

## Bewijs, geen aanname

Dit is de regel waar Luka het hardst op let, omdat het hier het vaakst misging.

"Het staat in de code" bewijst niet dat het draait. "Het zou nu moeten werken"
bewijst niets. Groene tests bewijzen dat een functie wérkt, niet dat iemand hem
aanroept — er zat een complete leerlus in deze codebase die gebouwd, getest en
gedocumenteerd was, en nul aanroepers had.

Wat wél telt: een test die faalt zónder je wijziging. Een meting ná de
verandering, niet ervoor. De gebouwde bundel doorzoeken in plaats van de bron.
Een screenshot van het echte scherm.

Een grep die niets vindt bewijst niet dat iets niet bestaat — het kan anders
heten. Volg de aanroepketen voor je concludeert.

## Zeg wat je niet weet

Een eerlijk "geblokkeerd, want X" is bruikbaar. Een onterecht vinkje is erger
dan geen vinkje, want er wordt op voortgebouwd.

Blijkt een taakomschrijving niet te kloppen, zeg dat expliciet: wat er stond,
wat je mat, wat het werkelijk was. Stilletjes iets anders doen laat de ander met
de oude tekst achter.

## Doe wat er gevraagd is

Niet minder, en ook niet meer. Een provider die niemand vroeg erbij zetten kost
tijd om er weer uit te halen. Twijfel je tussen twee redelijke invullingen: kies
de beste, noem in één zin welke aanname je maakte, en werk door.

## Kort

Luka raakt het overzicht kwijt bij lange verslagen, en zegt dat ook. Een tabel
met wat er mis was en wat je mat is leesbaar; drie alinea's aanloop niet.

## Vorm

Kleur zit in letters, niet in vlakken. De plaat is de achtergrond, panelen zijn
het papier en niet doorzichtig. Zie `UI-MAATSTAF.md`.
