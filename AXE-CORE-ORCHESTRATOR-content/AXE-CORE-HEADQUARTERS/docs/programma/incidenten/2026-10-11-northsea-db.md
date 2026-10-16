# Incident — NorthSea-database stond stil van 11 tot 15 oktober

Vastgesteld 14 oktober 2026, 18:00 UTC. Status: **database terug, oorzaak niet weg**.
Ernst: hoog. NorthSea deed ruim vier dagen niets, en niemand kreeg een melding.

## Stand 15 oktober, 21:45 UTC (gemeten)

- Postgres is op **15 okt 10:33:54 UTC herstart** (`pg_postmaster_start_time`). Door wie
  staat nergens; niet vanuit deze sessie. Sindsdien antwoorden REST en SQL weer.
- Alle drie de NorthSea-jobs staan weer op `ok`, 0 fouten op rij.
- **De lus is terug.** Edge-logs per uur sinds 17:00: 331–451 `PATCH action_queue` en
  326–472 `POST deal_events`, ~900 schrijfacties per uur. Hetzelfde patroon als vóór
  11 okt. De fix van 6 okt staat dus nog steeds niet op de box.
- Een pauze van `northsea:engine` is op 15 okt aangeboden en door Luka geweigerd.
  Het rapport hieronder blijft daarom open tot de uitrol.

### Driftcontrole van de box (15 okt, 23:58 UTC, alleen lezen)

Via een eenmalige `exec`-job van de VPS-planner (`northsea:uitrol-inventaris`,
goedgekeurd door Luka) zijn de sha256's van alle 34 `.py`-bestanden in
`/opt/northsea-mcp/app/northsea_mcp` gelezen en vergeleken met git:

- 30 bestanden zijn gelijk aan `orchestrator`.
- Precies 4 wijken af: `engine.py`, `engine_rules.py`, `service.py`,
  `sourcing_quality.py`. Alle vier zijn byte-gelijk aan `1c25cf93^`, de versie van
  vóór de fix. Na `1c25cf93` heeft geen commit `northsea_mcp/` meer aangeraakt.
- Laatste backup op de box: `20261005-152131`. De laatste uitrol was dus vóór de fix.
- **Geen onbekend werk op de box.** Uitrollen vervangt alleen die vier bestanden door
  hun versie uit `1c25cf93`; `deploy.sh check` zal precies die vier noemen.
- Git-checkouts op de VPS (`/root/AXE-CORE-` op `0be1b9b`, `/opt/axe-workspace/AXE-CORE-`
  op `9a84889`) zijn van juli/augustus en bevatten de fix niet.
- Schijf: 157 GB vrij. Dienst `northsea-mcp` actief, versie 1.4.1.

De job zelf staat nog in `core_schedules` met als volgende moment 1 januari 2027;
hij leest alleen. Uitzetten: `update public.core_schedules set enabled = false
where job_key = 'northsea:uitrol-inventaris';`

### Correctie op de oorzaak

De database is klein: 35 MB, 22.037 rijen in `deal_events`, 520 in `action_queue`.
Een volledige scan daarvan kost weinig; "een tabel die elke dag groter werd" was
dus overdreven. De rem van 6 okt onderdrukt de dubbele inserts juist (daarom zo
weinig rijen). Wat wél vaststaat: een constante stroom van ~1.000 schrijfacties per
uur, statement-timeouts vanaf 11 okt 02:00, en een instantie die daarna niet meer
antwoordde. Of de compute-instantie zijn IO- of geheugenbudget opmaakte of dat er
aan de kant van het platform iets misging, is uit de logs niet te bewijzen. De lus
weghalen blijft de enige oorzaak die binnen onze macht ligt.

## Wat je ziet

- Elke aanroep op AXE Commodities (`kbimnuepbecbyezedvih`) eindigt in **HTTP 522**:
  REST, Auth (`/auth/v1/health` na 20 s) en SQL via de Management API
  ("Connection terminated due to connection timeout"). Alleen Storage antwoordt.
- De Management API meldt het project tegelijk als `ACTIVE_HEALTHY`. Die status
  zegt dus niets over de database zelf.
- `core_schedules` op het gedeelde project: `northsea:engine` 22× mis,
  `northsea:operations` 21×, `northsea:discovery` 20×. Elke keer HTTP 502 van de
  MCP op `127.0.0.1:8040`, die zelf wel `{"status":"ok","version":"1.4.1"}` geeft.
- Er is geen push-abonnement (0 rijen), dus de backoff-meldingen bereikten niemand.

## Tijdlijn (uit de Supabase-logs, UTC)

| moment | wat de logs zeggen |
|---|---|
| 10 okt, de hele dag | Steeds ~1.000 schrijfacties per uur van `python-httpx/0.28.1`: per uur ~350 `POST /deal_events` en ~340 `PATCH /action_queue`, plus volledige tabelleesrondes |
| 11 okt 02:00 | Eerste `canceling statement due to statement timeout` — 30 in dat uur |
| 11 okt 03:44 | Zelfs `SELECT … FROM pg_settings` duurt 17 s |
| 11 okt 03:56:48 | Laatste regel in `postgres_logs`. Daarna niets meer |
| 11 okt 03:57 | PostgREST: `PGRST002 Could not query the database for the schema cache`; alle reads 503 |
| 11 okt 07:27 → nu | Alleen nog 522 aan de rand |

## Oorzaak

**De oude engine draait nog op de VPS.** Commit `1c25cf93` (6 okt, "stop budgetlus")
laat een uitgeput onderzoeksbudget wachten tot de UTC-dagreset
(`deferred_until_reset`). `docs/northsea/HERSTEL_20261006.md` zegt het zelf: die
Python-wijziging is **niet uitgerold**, omdat de sessie geen VPS-sleutel had.
Op de box schrijft de engine daarom elke tick, voor elke deal met een
goedgekeurde maar onbetaalde onderzoeksblokkade, één `PATCH action_queue` en één
`POST deal_events` (`research_budget_exhausted_today`). Dat is vier keer per uur
× ~85 deals. Dat het meetbare patroon (constant ~1.000 schrijfacties per uur)
precies daar uitkomt, is het bewijs.

**De rem in de database maakte het erger.** Migratie
`northsea_research_event_storm_guard` remt die events met een `BEFORE INSERT`-trigger
die per insert een `exists (select … from deal_events where event_type = … and
created_at …)` doet, onder een advisory lock. Er staat geen index op
`(event_type, actor, opportunity_id, created_at)`: elke van die ~350 inserts per
uur scant een tabel die door dezelfde lus elke dag groter werd.

Daarbovenop pagineren `fetch_all` (engine, operations-sweep, leeslaag) met
`offset` over volledige tabellen. Op een kleine compute-instantie is dat
genoeg om de IO op te maken. Daarna antwoordt Postgres niet meer.

## Wat er al gedaan is (14–15 okt)

- Oorzaak vastgesteld uit logs en code; niets weggegooid, geen data aangeraakt.
- Index-migratie geschreven (zie hieronder), **nog niet toegepast**: de DB is onbereikbaar.
- `northsea:engine` pauzeren in `core_schedules` geprobeerd. De schrijfactie via de
  Supabase-koppeling liep tweemaal vast op de 60 s-limiet (lezen werkte wel):
  **niet gelukt**, daarom bij de acties voor Luka.

## Herstel — in deze volgorde

Draai je de volgorde om, dan valt de database binnen dagen opnieuw om.

1. **Luka — de engine stilzetten** (anders begint de lus meteen weer):
   ```sql
   update public.core_schedules set enabled = false where job_key = 'northsea:engine';
   ```
   (gedeelde project `pqnngpcgbdwxavbatbia`). Terugdraaien: `enabled = true`.
2. **Luka — AXE Commodities herstarten**: Supabase Dashboard → AXE Commodities →
   Project Settings → General → *Restart project*. Overweeg één compute-stap
   hoger zolang de achterstand wordt weggewerkt.
3. **Na de herstart — index** (migratie
   `supabase/northsea/migrations/20261015090000_northsea_deal_events_dedupe_index.sql`)
   met `create index concurrently`, zodat de rem niet meer scant.
4. **Mac — northsea-mcp uitrollen** met de fix van 6 okt:
   `bash backend/northsea_mcp/deploy/deploy.sh check`, dan `deploy` (backup, health,
   rollback zitten erin). Bewijs per `HERSTEL_20261006.md` stap 5: één tick, en de
   tweede tick schrijft geen nieuw budgetevent.
5. **Pas dan** `northsea:engine` weer aanzetten en een uur meten: schrijfacties
   per uur op `deal_events` moeten dalen van ~350 naar ongeveer nul.
6. **Melding die aankomt**: zie `PROGRAMMA-HEARTBEAT` in `programma.json`. Dit
   incident duurde drie dagen omdat een falende job niemand bereikte.

## Wat dit incident leert (voor het programma)

- Een fix die niet live staat is geen fix. Uitrolbewijs hoort bij "klaar" (regel 6 en 7).
- `ACTIVE_HEALTHY` van een platform is geen heartbeat. Een heartbeat leest een rij.
- Elke lus die per tick schrijft heeft een plafond per uur nodig, in code en in de DB.
