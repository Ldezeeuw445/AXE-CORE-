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

## Acties voor Luka (wat alleen jij kunt)

| # | wat | waarom jij |
|---|---|---|
| 1 | `update public.core_schedules set enabled = false where job_key = 'northsea:engine';` | schrijven via de koppeling vanuit de cloud liep vast |
| 2 | AXE Commodities herstarten (Dashboard → Project Settings → General → Restart) | kan niet via de API van deze sessie |
| 3 | Op de iMac: `bash backend/northsea_mcp/deploy/deploy.sh check`, dan `deploy` | de VPS-sleutel staat alleen op de Mac |
| 4 | tradingosapp.com: Vercel betalen of naar Cloudflare Pages | billingbesluit (niveau C) |
| 5 | AXON-project toegankelijk maken voor deze Supabase-koppeling, of de AXON-migraties zelf toepassen | ander account |
| 6 | In AXE Core op je telefoon meldingen toestaan, en bevestigen dat de proefmelding aankomt | 0 abonnementen: anders hoort de telefoon niets |
| 8 | Nieuwe Unusual Whales-sleutel als `UNUSUAL_WHALES_TOKEN` (Supabase Edge-geheim) en `UNUSUAL_WHALES_API_KEY` (VPS) | alleen jij hebt het account |
| 9 | Zeggen of `ai-proxy` en `ai-proxy-v2` echt weg mogen (verwijderen is onomkeerbaar) | nu staan ze als 410-stub |
| 7 | Op de Mac mini in `backend/axe_api/.env.local`: `NORTHSEA_SUPABASE_URL` en `NORTHSEA_SUPABASE_SERVICE_ROLE` (dezelfde waarden als op de VPS) | zonder die twee meet de bewaker de NorthSea-database niet |
