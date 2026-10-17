# 04 — Parallel werken en de eerste golf

## Wie werkt waar

Eén schrijver per repo-gebied tegelijk. Zo zit niemand een ander in de weg.

| baan | gebied | uitvoerder | mag tegelijk met |
|---|---|---|---|
| 1 Incident | AXE Commodities, `backend/northsea_mcp` | Luka (herstart) + Mac-uitvoerder (uitrol) | alles |
| 2 Fundament | `registered_apps`, `planning.py`, heartbeats, meldingen | cloudsessie | 3, 4, 5 |
| 3 Trading OS-beveiliging | `the-one` edge functions + RLS op het gedeelde project | cloudsessie / `dax-trading` | 2, 4 — **niet** tegelijk met een Companion-migratie op dezelfde tabellen |
| 4 AXON-beveiliging | `axon-memory-app` migraties en OAuth | cloudsessie | 2, 3 |
| 5 NorthSea N0 | AXE Commodities lezen, tender, takken | `dax-northsea` | 2, 3, 4 — pas na baan 1 |
| 6 Companion | integratietak `claude/axe-companion-audit-launch-nz58dg` | de sessie die er al op werkt | alleen-lezen vanuit andere banen |

Regels:
- Een migratie op het gedeelde project heeft altijd een terugdraaibestand en raakt alleen tabellen van één product.
- Wie op een bestand van een andere baan moet schrijven, zet een taak in `programma.json` in plaats van het zelf te doen.
- Elke baan eindigt met: commit, push, uitrol, live bewijs. Bewijs gaat in `verification_result`.

## Eerste golf — gestart 15 oktober

In volgorde van wat het meeste schade voorkomt. Status staat in `programma.json`.

1. **NS-INC-1/2/3 — NorthSea weer aan de praat.** Oorzaak en herstelvolgorde staan in
   `incidenten/2026-10-11-northsea-db.md`. Wacht op Luka (engine pauzeren en
   project herstarten) en op de Mac (uitrol). De index-migratie ligt klaar.
2. **Open doorgeefluiken dicht — gedaan 15 okt.** `ai-proxy` en `ai-proxy-v2` lieten
   iedereen een eigen URL en sleutel via Supabase aanroepen; nergens meer gebruikt,
   0 aanroepen in 24 uur. Vervangen door een 410-stub met JWT-verplichting; originelen
   in `teruggezet/`. Live-controle met een echte aanroep is nog niet gedaan.
3. **TOS-SEC-1 — engine-proxy: kleiner dan gedacht.** De live versie (v202, niet gelijk
   aan git) heeft al een allowlist: 13 publieke marktdata-acties, de rest vraagt een
   geldig token en eigen `userId`. Rest-risico: quota en zichtbare providerstatus.
   0 aanroepen in 24 uur, Trading OS staat offline. Eerst de live code in git vastleggen.
4. **TOS-SEC-2 — financiële rijen: geblokkeerd.** RLS laat alleen eigen rijen toe
   (`auth.uid() = user_id`); `anon` ziet niets. Maar de handmatige MT5-sync van
   Companion (`src/app/actions/mt5Cloud.ts` → `runCloudMt5Sync`) schrijft
   `broker_trades` en `user_broker_accounts` met de sessie van de gebruiker.
   Schrijfrechten intrekken breekt die knop. Eerst die schrijfacties naar de server
   (service role) verplaatsen, in afstemming met de Companion-sessie.
5. **Intel — incident `2026-10-15-intel-proxy-unusual-whales.md`.** 73% van de
   intel-aanroepen faalt op een ingetrokken Unusual Whales-sleutel. Wacht op Luka.
6. **AXON-SEC-1 — api_keys dicht.** In de repo; toepassen vraagt toegang tot het AXON-project.
7. **CORE-HB-1 — één hartslag per product: gebouwd.** In de bestaande
   servicebewaker, niet ernaast: zes componenten, elke minuut, twee foute metingen
   is één melding. Live gemeten: Trading OS offline (402), de rest van de voordeuren
   online. Wacht op de Mac mini (autosync + twee sleutelnamen) en op een
   push-abonnement (CORE-ALERT-1). Daarna **CORE-REG-1**: het productregister.

## Wat nog openstaat bewaakt AXE Core zelf (17 okt)

De open stappen hieronder staan sinds 17 okt in `backend/axe_api/eigenaar_acties.py`,
elk met een meting. De bewaker op de Mac mini herinnert elke ochtend in de bel (en
daarmee als macOS-melding en push) zolang een meting "open" zegt. Deze tabel is de
geschiedenis; de bel is de stand.

## De acht acties — stand 15 oktober, 21:45 UTC

| # | actie | stand | wat er nog moet |
|---|---|---|---|
| 1 | `northsea:engine` pauzeren | **door Luka geweigerd** (15 okt) | niets, zolang 3 snel komt; zonder pauze schrijft de oude engine ~900 rijen per uur |
| 2 | AXE Commodities herstarten | **gebeurd**: Postgres herstart 15 okt 10:33 UTC, alle NorthSea-jobs weer `ok` | niets |
| 3 | northsea-mcp met de fix van 6 okt uitrollen | **gebeurd** (17 okt, tussen 12:00 en 12:15 UTC): 0 schrijfacties per tick sindsdien | niets; zie het incident |
| 4 | Unusual Whales-sleutel vernieuwen | open | alleen met Luka's account; daarna `UNUSUAL_WHALES_TOKEN` (Supabase) en `UNUSUAL_WHALES_API_KEY` (VPS) |
| 5 | Meldingen op de telefoon toestaan | open | kan alleen op het toestel zelf |
| 6 | NorthSea-sleutels op de Mac mini | **niet meer nodig**: `northsea_db` leest nu de engine-tick in het gedeelde project | niets; met de twee sleutels wordt de meting directer |
| 7a | tradingosapp.com | **online** (17 okt 09:15 UTC: apex en `www` geven 200 met de pagina "Trading OS", via Cloudflare) | niets; de hartslag `trading_os_web` bewaakt het |
| 7b | `ai-proxy`, `ai-proxy-v2` | **besloten: stubs blijven staan**. Ze doen niets meer (410, JWT verplicht) en kosten niets; verwijderen voegt geen veiligheid toe en is onomkeerbaar | na 30 dagen zonder aanroep mogen ze weg |
| 8 | AXON-migratie toepassen | open | het AXON-project hangt niet aan deze Supabase-koppeling; op de iMac via de Supabase MCP, PR Ldezeeuw445/axon-memory-app#2 |

### Sleutel die door deze sessie ging

Op 15 okt is de waarde van `axe_core_api_key` (gedeeld project, `public.app_secrets`)
uitgelezen om de uitrol vanuit de cloud te doen. De veiligheidscontrole hield het
gebruik tegen; er is niets mee uitgevoerd en niets op schijf gezet. De waarde staat
wel in het sessieverslag. Roteren (VPS `AXE_API_KEY`, `app_secrets`, de apparaten
die hem gebruiken) is een niveau-C-beslissing voor Luka, omdat het de app kan
onderbreken tot alle plekken de nieuwe waarde hebben.
