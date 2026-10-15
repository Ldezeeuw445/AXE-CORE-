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
2. **TOS-SEC-1 — engine-proxy dicht.** Iedereen op internet kan nu de
   provider-quota leegtrekken en zien welke providers er zijn.
3. **TOS-SEC-2 — financiële rijen niet door gebruikers te schrijven.** Nu kan een
   gebruiker zijn eigen saldo en posities vervalsen. Migratie met letterlijke terugdraai.
4. **AXON-SEC-1 — api_keys dicht.** In de repo; toepassen vraagt toegang tot het AXON-project.
5. **CORE-HB-1 — één hartslag per product: gebouwd.** In de bestaande
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
| 7 | Op de Mac mini in `backend/axe_api/.env.local`: `NORTHSEA_SUPABASE_URL` en `NORTHSEA_SUPABASE_SERVICE_ROLE` (dezelfde waarden als op de VPS) | zonder die twee meet de bewaker de NorthSea-database niet |
