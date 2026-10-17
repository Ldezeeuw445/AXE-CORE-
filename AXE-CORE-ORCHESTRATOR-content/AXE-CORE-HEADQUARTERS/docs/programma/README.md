# Productprogramma — vijf producten, één systeem

Hier staat wat de vijf producten moeten worden, wat ze nu zijn, en wat er tussen
zit. AXE Core voert het uit; agents en sessies lezen het voordat ze beginnen.

| bestand | wat |
|---|---|
| `canon/` | de vijf masterspecs, **letterlijk** zoals Luka ze gaf. Productcanon: niet herschrijven, niet inkorten. Wat het moet worden staat daar. |
| `01-REALITEIT.md` | wat er echt draait, gemeten 14–15 okt |
| `02-AFHANKELIJKHEDEN.md` | wat op wat wacht, en welke gedeelde bronnen botsen |
| `03-GAPMATRIX.md` | per product en fase: bestaat / half / stuk / ontbreekt |
| `programma.json` | de taken, machineleesbaar, met status, eigenaar, bewijs en terugdraaipad |
| `04-PARALLEL-EN-GOLF-1.md` | wie waar werkt, de eerste golf, en wat alleen Luka kan |
| `incidenten/` | wat er misging, waarom, en de herstelvolgorde |

## Hoe je dit gebruikt

1. Lees de canon van je product en de regel over dat product in `01-REALITEIT.md`.
2. Pak een taak uit `programma.json` waarvan alle `dependencies` op `done` staan.
3. Zet hem op `running` met `started_at`. Werk. Werk `last_progress_at`, `tests_run`,
   `build_result`, `deployment_result` en `verification_result` bij.
4. `done` betekent: gecommit, gepusht, uitgerold, en live bewezen. Code in git
   zonder uitrol is `verifying`, niet `done` — dat is precies hoe NorthSea op
   11 oktober stilviel.
5. Niveau C (zie `goedkeuringsniveaus`) gaat naar Luka. Altijd.

## De bouwlus (autopilot)

`pg_cron` zet elk uur via `core_bouw_aanvullen()` per app één bouwtaak klaar, met de
opdracht uit `core_bouw_apps.opdracht` (de programmataken hierboven). De planner op
de Mac mini voert hem uit met een ingelogde CLI (Claude, Codex; Cursor valt bij een
betaalfout zes uur weg), in de checkout van die repo op zijn werkbranch, met 25
minuten en rechten om tests, lint, typecheck en build te draaien.

Sinds 17 okt blijft het werk niet meer in die checkout liggen. Na een geslaagde run met
echte wijzigingen doet `backend/axe_api/bouw_publiceer.py` het volgende:
- Hij weigert als er iets geheims mee zou gaan: een `.env`, een sleutelbestand, of een
  regel die op een sleutel lijkt. Een anon-JWT mag wel mee, een service-role-JWT niet.
- Hij commit op de werkbranch, nooit op main of master en nooit met force.
- Hij pusht en houdt per branch één **draft-PR** bij.

De lus merget nooit en haalt nooit een PR uit draft; dat doet Luka. Uitzetten zonder
uitrol: `AXE_BOUW_PUSH=0` in de omgeving van de planner op de Mac mini. Zonder
`GITHUB_TOKEN` daar wordt er wel gepusht, maar komt er geen PR.

## Grenzen die niet verschuiven

Toestemming van Luka is nodig voor: destructieve productie-DB-wijzigingen,
een beveiligingsgrens verruimen, onomkeerbaar verwijderen, rechten op
financiële of handelsaccounts, bindende commerciële afspraken, gecontroleerde
introducties waar vereist, commissie- en fee-afspraken, bankinstructies, beheer
of verplaatsing van geld, materiële juridische uitspraken, billing,
sleutelrotatie die productie kan onderbreken, en publicatie van gevoelige of
privédata. Een falende functie is nooit een reden om privacy of beveiliging
te verzwakken. Geheimen staan hier alleen op naam.
