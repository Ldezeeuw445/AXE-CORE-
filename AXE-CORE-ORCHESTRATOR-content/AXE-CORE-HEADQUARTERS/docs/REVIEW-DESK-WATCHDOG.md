# Website Review Desk — zelfstandige bewaking

## Wat draait

`scripts/review-desk-watchdog.sql` registreert een pg_cron-taak om de tien minuten.
De bestaande Core-scheduler ziet hem als `observed`; alleen pg_cron voert hem uit.
Iedere uitvoering verschijnt in `core_job_runs`. Er zijn geen AI-aanroepen.

De taak bewaakt de `updatedAt`-datum in het privérapport
`axe_website_review_desk_v1`. Meer dan drie uur oud, ontbrekend of meer dan vijf
minuten in de toekomst geeft een waarschuwing. Alleen een overgang naar
verouderd of hersteld maakt een generieke eigenaargebonden notificatie.
De toestand staat privé in `axe_website_review_watchdog_v1`.

Het kanaal `AXE Core report watchdog` verschijnt in Finance → Website Review
Desk. Alleen zijn eigen controledatum wijzigt. Rapportdatum, bronmetingen en
inkomsten blijven onaangeraakt. Een verse watchdog is geen verse broncontrole.

## Grenzen en overname

Deze taak leest geen Gmail, Sites of Stripe, publiceert geen promotie en
verstuurd geen klantberichten. De afzonderlijke verkoopcontrole moet blijven
draaien totdat de eigen bronworker aantoonbaar werkt. Hiervoor zijn nog
broncredentials, idempotente cursors, foutafhandeling en twee bevestigde
geplande end-to-end uitvoeringen nodig. Houd de acquisitielimieten en
afmeldingen centraal bij wanneer meerdere uitvoerders bestaan.

De huidige taak vereist een bestaand privérapport en bestaande Core-tabellen.
De installatie is herhaalbaar op jobnaam. Uitschakelen via
`core_schedules.enabled = false` voorkomt uitvoering; verwijderen van de
pg_cron-taak kan met `cron.unschedule('axe-review-desk-watchdog')`.
Wijzig uitsluitend de rij met de bijbehorende job_key.

## Gecontroleerd op 5 oktober 2026

- Een werkelijke pg_cron-uitvoering is geslaagd.
- Twee herhaalde controles maakten geen extra waarschuwing.
- De oorspronkelijke rapportdatum en metrics bleven identiek.
- Een hersteltest gaf precies één herstelmelding; alle testwijzigingen zijn
  teruggedraaid met ROLLBACK.
- Weergave op fysieke apparaten en bezorging van pushmeldingen zijn hiermee
  niet bewezen.
