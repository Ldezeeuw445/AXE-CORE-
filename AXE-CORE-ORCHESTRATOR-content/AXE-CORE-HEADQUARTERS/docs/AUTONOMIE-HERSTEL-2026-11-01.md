# Autonomieherstel — 1 november 2026

## Vastgesteld

Live accountregistratie: drie Claude- en twee Codex-logins op de Mac mini,
verse heartbeats op Mac mini en iMac. Gebruikspercentages onbekend. De vijf
actieve missies waren controles/rapporten, geen launchmissies. De losse
bouwlus meldde voltooid terwijl verslagen expliciet zeiden dat tests niet
konden draaien. Trading OS had een genummerde Queue die de checklistparser
als leeg las. De Mac-planner staat live op `10 */3 * * *`.

## Gewijzigd

- Genummerde Queue en DONE-regels worden herkend; 'Blocked on Luka' wordt
  niet als bouwopdracht opgepakt.
- Achtergrondbouw verdeelt werk over bruikbare accounts, ook als de voorkeur
  nog werkt. Interactieve accountkeuze blijft bestaan. Modellen van een andere
  provider worden bij accountwissel niet aan de nieuwe CLI doorgegeven.
- De coding-seat snapshot bevat het privacyveilige gebruiksboek. De worker
  hoeft niet meer overal nul runs uit een leeg snapshot af te leiden.
- De planner kiest ouder open werk eerst en beschermt zijn ronde met een lock.
  Een niet-Mac-lus en nieuw aangemaakte Mac-schedules pollen standaard elke
  vijf minuten. **Een bestaand databaseschedule wordt niet stil overschreven.**
- De host controleert gewijzigde bouwtaken vóór publicatie met beschikbare
  typecheck/lint/test/build-scripts. Ontbrekende npm-dependencies krijgen alleen
  een lockfile-installatie zonder lifecycle-scripts. Geen vrije shell of nieuwe
  CLI-permissiemodus. Iedere controle heeft een deadline; timeout stopt ook
  kindprocessen. Foutuitvoer wordt ontdaan van herkenbare geheimen en aan de
  volgende poging doorgegeven.
- Een mislukte controle wordt geen geslaagde bouwtaak. Gepushte code heeft
  `delivery_status=review_required`, UI `in-progress` en 75% voortgang: het is
  nog geen geïntegreerd of live product. Een niet-afgeleverde run krijgt een
  geblokkeerde UI-status. Een korte uitkomst gaat naar de bestaande
  `core_notifications`, met deduplicatie per taak/uitkomst.
- `chat` heeft een workerhandler; `planner` blijft alleen van de Mac-planner.
- SSH-fouten of een lege VPS-hashinventaris zijn onbekend, nooit 'in sync'.

## Gecontroleerd

- 233 gerichte backendtests geslaagd, inclusief regressies voor de live Queue,
  foutieve voltooiing, hostcontroles, gebruikssnapshot en SSH-fout.
- Typecheck geslaagd; webbuild inclusief secretscontrole geslaagd.
- Volledige Vitest: 3070 geslaagd, dezelfde negen fouten als de ongewijzigde
  bron (exact dezelfde testnamen). Lint: 443 fouten/33 waarschuwingen in
  ongewijzigde frontendbron. Geen frontendbron gewijzigd.

## Uitrol en acceptatie — nog te bewijzen

De directe interne uitvoeringsroute werd door automatische goedkeuringscontrole
afgewezen wegens brede toegang tot bestanden/processen op afstand. Die route is
niet opnieuw of via een omweg gebruikt. De SSH-sleutel van de VPS is in deze
werkruimte niet beschikbaar. Code in git bewijst dus geen live uitrol.

1. Controleer de beide canonical checkouts en autosync; bewaar bestaand werk.
   De hoofdcheckout op een sessietak kan autosync blokkeren. Nooit blind resetten.
2. Laat de bestaande uitrol de gecontroleerde bestanden ophalen; controleer
   `vps_sync.py check` en de draaiende API/worker na herstart. De lokale API
   moet de nieuwe Python-code laden, alleen een Tauri-build is onvoldoende.
3. Pas daarna het bestaande schedule `axe_core:planner` (executor `mac`) aan
   naar `*/5 * * * *`, met runtime 7200 s. Behoud id, job_key en accountbudgetten;
   maak geen tweede scheduler. Vorige waarden: `10 */3 * * *`, runtime 1800 s.
4. Volg een echte gewijzigde bouwtaak: account → controles → publicatie → UI en
   melding. Een gefaalde controle mag geen publicatie of groen 'done' geven.
5. Bewijs ontvangst op beide Macs en de bestaande Samsung-APK, ook vergrendeld.
   Een ingevoegde notificatierij is geen bewijs van ontvangen native melding.
6. Daarna: launchmissies per product, gecontroleerde integratie/uitrol,
   proactieve prioritering uit bestaande productcanon en een duurproef van 24 u.

De code claimt geen '24/7 cofounder klaar'. Accounts blijven begrensd, ideeën
worden niet willekeurig tot projecten gemaakt en bestaande goedkeuringen voor
productuitrol, geld, handelsacties en gevoelige wijzigingen blijven gelden.
