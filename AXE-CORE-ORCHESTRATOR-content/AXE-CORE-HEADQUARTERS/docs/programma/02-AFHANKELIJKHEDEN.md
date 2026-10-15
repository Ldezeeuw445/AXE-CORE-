# 02 — Afhankelijkheden

Wat op wat wacht. Een pijl `A → B` betekent: B kan pas echt af als A er is.
De volgorde komt uit regel 4 van de opdracht: eerst het fundament, dan de sporen.

## Lagen

```
L0  Machines en data      VPS · STRATO · Macs · Supabase (gedeeld) · AXE Commodities · AXON-project
        │
L1  AXE Core-fundament    taakkernel · scheduler · productregister · heartbeat per product · meldingen die aankomen
        │                 · geheimen op naam · uitrolbewijs
        ├──────────────┬──────────────────────────┐
L2  AXON-contracten   Trading Platform Core      NorthSea N0 (waarheid)
    (capture, recall,  (instrumenten, marktdata,       │
     bron-id's, MCP)    chart-staat, tekeningen,  NorthSea N1… (parallel)
        │               indicatoren, risk, alerts)
        │                    │
L3      ├──── Spoor A: Trading OS (T2–T10)
        ├──── Spoor B: AXE Companion (C1–C10)
        ├──── Spoor C: AXON Memory-product (A1–A12)
        └──── Spoor D: AXE Code (X1–X12)  ← bouwt op L1, raakt L2 alleen via contracten
```

## Harde afhankelijkheden

| van | naar | waarom |
|---|---|---|
| Productregister (L1) | elke heartbeat, elke uitrol, AXE Code-projectsysteem (X2) | zonder één plek met repo/tak/commando's/health weet niemand wat "klaar" is |
| Meldingen die aankomen (L1) | NorthSea N9, Companion C6, elk incident | het NorthSea-incident liep drie dagen omdat 0 abonnementen niets ontvingen |
| Uitrolbewijs (L1) | elke fase-gate (regel 6) | de NorthSea-fix van 6 okt stond in git en niet op de box |
| Trading Platform Core (L2) | T2–T9 en C1–C4 | marktdata, symbolen, indicatoren en MetaAPI bestaan nu twee keer, in twee repo's, met dezelfde edge-functienaam (`intel-proxy`) die elkaar overschrijft |
| Instrumentregister + chart-staat (L2) | T9 / C3 pariteit (XAUUSD 1H gelijk in beide apps, tekeningen synchroon) | pariteit kan niet zonder één bron voor symbool, timeframe en tekening |
| Python-terminaldienst of vervanging | T5, T6, T7 in Trading OS | half de terminal is nu een no-op zonder `VITE_TRADING_TERMINAL_API_URL` |
| Vercel-betaling of andere host | elke Trading OS-release | het domein geeft 402 |
| AXON recall met bron-id's (A3) | C8, T7, AXE Core-geheugen | "wat weet AXE van mij" moet herleidbaar zijn |
| AXON-project toegankelijk | A1–A6 live | `ktaditgtbubonrahyiig` is vanuit deze sessie niet te bereiken |
| AXE Commodities gezond | alles van NorthSea | zie incident |
| VPS-sleutel op een uitvoerder | elke Python-uitrol (northsea-mcp, axe_api) | cloudsessies hebben geen sleutel; de Mac wel |

## Gedeelde bronnen die nu botsen

| bron | wie gebruikt hem | botsing |
|---|---|---|
| edge function `intel-proxy` (gedeeld project) | Companion én Trading OS, andere code | laatste uitrol wint; de andere app breekt stil |
| `user_broker_accounts`, `broker_trades` | aangemaakt door Trading OS-migraties, ~119× gebruikt door Companion | eigenaar van het schema is niet vastgelegd |
| `axe_user_entitlements.plan` CHECK | beide apps | verschillende toegestane waarden per repo |
| `supabase_migrations.schema_migrations` | alleen AXE Core-migraties | Companion- en Trading OS-schema staan er niet in |
| `axe_ops.*` (Companion-cron) | AXE Core Control Plane leest het | SQL staat in geen enkele repo |
| VPS 212.227.91.79 | AXE Core API, task worker, NorthSea MCP, Companion, Ollama | één box; een volle schijf of een herstart raakt vier producten |

## Wat parallel kan zonder elkaar te raken

- NorthSea-herstel (eigen project, eigen code-map) naast alles.
- Trading OS-beveiliging (edge function + RLS) naast AXON-beveiliging (andere repo, ander project).
- AXE Core-register en heartbeats naast de sporen: het register schrijft alleen eigen tabellen en leest de rest.
- Companion wacht op de lopende sessie op zijn integratietak; geen tweede schrijver op dezelfde bestanden.
