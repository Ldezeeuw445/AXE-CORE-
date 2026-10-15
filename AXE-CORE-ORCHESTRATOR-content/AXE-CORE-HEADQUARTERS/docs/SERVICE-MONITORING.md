# AXE servicebewaking

Eén onafhankelijke bewaker op de Mac mini meet elke minuut de publieke AXE API,
de lokale API, Supabase en de bestaande VPS-agentstatus. Twee opeenvolgende
foute metingen maken één melding; twee goede metingen bevestigen herstel.
Succesvolle CrewAI/Docker/GitHub-probes worden maximaal vijf minuten gecachet.
Niet ingestelde diensten en onbekende afgeleide status worden geen fictieve uitval.
Een statusprobe bewijst beschikbaarheid, niet dat een agenttaak is geslaagd.

De lokale SQLite-lijst in `~/.axe/monitoring` overleeft een herstart. Meldingen
worden met een vast UUID naar `core_notifications` geschreven. Na database-uitval
komen opgeloste, nooit getoonde incidenten niet alsnog als een alarmbui binnen.
De bel ververst ook elke dertig seconden via REST, zonder Realtime nodig te hebben.
Status en Samsung Device Manager tonen dezelfde meetnotitie en waarschuwen bij
een ontbrekende meting of een meting ouder dan drie minuten.

## Activatie

De bestaande Mac-autosync en `backend/axe_api/run-local.sh` installeren automatisch
`com.axe.service-monitor` via launchd. Alleen een host met `AXE_MAC_EXECUTOR=1` in
`backend/axe_api/.env.local` start de bewaker. De iMac start geen tweede bewaker.
Het lokale `.venv-local` en de bestaande Supabase-serverconfiguratie moeten aanwezig zijn.

Geen geheimen in git. Configuratie in de bestaande `.env.local`:

- `AXE_MONITOR_API_URL`: publieke API, standaard `https://api.axecompanion.com`.
- `AXE_MONITOR_LOCAL_URL`: standaard loopback met de geconfigureerde `PORT` (anders 8001).
- `AXE_MONITOR_DIR`: standaard `~/.axe/monitoring`.
- `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE`: bestaande serverconfiguratie.

De verbeterde CrewAI/Docker/GitHub-probes vereisen de deployment van `main.py`
en `service_probes.py` naar de VPS. Ze staan beide in het driftbewuste
`scripts/vps_sync.py`-manifest. Zonder die deployment staat Docker/GitHub bij
de bewaker eerlijk als onbekend. `service_probes.py` mag niet zonder `main.py`
of andersom worden uitgerold.

## Eén hartslag per product (15 oktober)

Naast de AXE-diensten meet dezelfde bewaker de vijf producten uit
`docs/programma/`. Geen tweede bewaker, geen tweede meldingenlijst.

| component | wat telt als online |
|---|---|
| `axe_core_web` | `https://axeheadquarters.com/` geeft 2xx |
| `companion_web` | `https://www.axecompanion.com/robots.txt` geeft 2xx |
| `trading_os_web` | `https://tradingosapp.com/` geeft 2xx (op 14 okt: 402, dus uitval) |
| `axon_web` | `https://app.axon-memory.com/` geeft 2xx |
| `northsea_mcp` | `https://mcp.northseacommodity.com/health` geeft `status: ok` |
| `northsea_db` | één gelezen rij uit `deal_automation_policy` in AXE Commodities |

`northsea_db` gebruikt `NORTHSEA_SUPABASE_URL` en `NORTHSEA_SUPABASE_SERVICE_ROLE`
uit dezelfde `.env.local` (namen gelijk aan `backend/northsea_mcp`). Zonder die
twee staat hij eerlijk op niet ingesteld. Hij bestaat omdat AXE Commodities op
11 oktober drie dagen stillag terwijl het platform `ACTIVE_HEALTHY` meldde
(`docs/programma/incidenten/2026-10-11-northsea-db.md`).

Live gemeten vanuit een cloudsessie op 15 okt: vier voordeuren online, Trading OS
offline, NorthSea MCP online, NorthSea-database niet ingesteld (geen sleutel daar).

## Meldingen

De externe Dependency Watch schrijft materiële, brongeverifieerde wijzigingen
via de bestaande Supabase-connector naar dezelfde `core_notifications`. De
kolommen en bestaande RLS zijn op 14 oktober 2026 gecontroleerd. Geen migratie.
Updates naar de app zijn geen bewijs dat het toestel de push heeft ontvangen.

Op 14 oktober: drie externe meldingen opgeslagen, nog geen Web Push-abonnement
voor Luka geregistreerd. Meldingen staan dus in de bel, niet bewezen op de telefoon.
De bestaande core-tabellen hebben RLS aan en de meldingtabel heeft de benodigde
rechten. De Supabase-wijziging van 30 oktober laat die bestaande grants intact.
Nieuwe public-tabellen moeten expliciete grants en RLS krijgen; de repositorytest
`supabaseMigrationAccess.test.ts` bewaakt dat vanaf migratiedatum 20261014.
Dat is geen volledige beveiligingsaudit van alle policies of andere projecten.

Op de Mac mini kan de observer een macOS-melding tonen, ook zonder database.
Telefoon-push gebruikt standaard de bestaande VPS-zender. Als de VPS uitvalt,
is de melding al in de database, maar kan telefoon-push op die zender wachten.
Voor onafhankelijke telefoon-push moet op **beide** hosts `AXE_PUSH_OWNER=observer`
worden ingesteld en op de observer de bestaande VAPID-configuratie aanwezig zijn.
Daarmee slaat de VPS-zender over en draait dezelfde `push_meldingen.py` op de
observer; gebruik niet twee zenders tegelijk. Bij observer-uitval wordt die
keuze niet automatisch teruggedraaid. De interface toont welke zender is ingesteld.

## Verifiëren op de echte apparaten

1. `launchctl print gui/$(id -u)/com.axe.service-monitor` op de Mac mini.
2. Lees `~/Library/Logs/axe-service-monitor.log` en open Status of Device Manager.
3. Bevestig een verse meting, correcte hosts en de ingestelde pushzender.
4. Gebruik een testdienst of gecontroleerd onderhoud om uitval/herstel te toetsen.
   Zet geen echte productie-agent zomaar uit voor een test.
5. Controleer één melding in de bel en op Samsung; klik moet Status openen.

Een Mac mini die uit of offline is kan zelf geen uitvalmelding verzenden.
De interface markeert zijn laatste meting als oud. Voor bewaking van de observer
zelf is een tweede, onafhankelijk bereikbare host nodig.
