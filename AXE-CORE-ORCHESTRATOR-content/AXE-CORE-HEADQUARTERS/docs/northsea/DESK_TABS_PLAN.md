# NorthSea Desk — de negen tabbladen naast Live Map

Branch `sessie/northsea-tabs`. Niets hiervan gaat naar `orchestrator` of in de Mac-mini-app
voordat Luka het in een preview gezien heeft en ja zegt.

Bronnen: Luka's specificatie (`~/Downloads/NORTHSEA_COMMODITY_DESK/`, vooral MASTER_PROMPT,
DATA_CONTRACT, POLICIES, UI_COLOR_AND_STATUS, ALERT_ROUTING, TASKS, CRONJOBS, AUTOMATIONS) en
negen voorbeeldschermen. De voorbeelden bepalen **indeling en gedrag**, niet de getallen: de
specificatie zegt "real data only; no screenshot/mock business data".

## 1. Wat er al staat (gemeten, 15 sep 2026)

| Laag | Wat | Waar |
|---|---|---|
| Pagina | `NorthseaDesk` op route `/maps-3d`, menu met 10 tabbladen (IcoonZuil links), kaartjes bovenin, dealtabel in het dock, AXE Chase rechts | `src/presentation/pages/northsea/` |
| Gebouwd | alleen **Live Map**; de andere negen tonen een placeholder | `NorthseaDesk.tsx` |
| Regels | wat actief/geblokkeerd/kritiek is, met 48 vitest-tests | `src/domain/northsea/{chase,desk,kaart}.ts` |
| Data | `GET /northsea/overzicht` → `northsea.py` → MCP-hub `supabase-axe-commodities` (**alleen-lezen**) → één SQL-query, 30 s cache | `backend/axe_api/northsea.py` |
| Hergebruik | taken (`/tasks`, Tasks-pagina), agenda (CalendarPage), cron (`/cron/schedules`, CronManager), marktkoersen (`fetchMarketSnapshot`), intel-kaartlagen (`intelProxyGateway`) | bestaand |

### De echte data (AXE Commodities, `kbimnuepbecbyezedvih`)

- 55 opportunities: stage `identified` 53, `verifying` 2; uitvoering `matched` 30, `qualifying` 18,
  rest 7. **Geen enkele heeft een waarde of commissiebedrag.**
- 100 bedrijven in 36 landen (supplier 49, buyer 39, both 5, broker 2, other 5);
  verificatie `reviewing` 90, `unverified` 10, **`verified` 0**. 55 contacten.
- 64 communicaties (30 d): e-mail uit 34, in 17, telefoon in 2, intern 11; 15 met e-mail-intelligentie;
  9 antwoordconcepten (pending 4, rejected 4, approved 1).
- 0 deal_documents, 4 inbound-bijlagen; 6 deal_evidence (geen enkele volledig geverifieerd),
  1 verification_check.
- 54 actieve sourcing-campagnes, 46 open deal_tasks, 41 open/wachtende acties, 65 deal_events.
- Producten vrijwel alleen koper (en twee keer rijst).

Gevolg voor het ontwerp: waar het voorbeeld "$48.6M", "Verified 92%" of "Aurubis AG" toont, toont de
desk wat er is — een streepje, "Not verified yet", of een lege staat die zegt wat ontbreekt.

## 2. Architectuur

```
Tab (React) ──► axeCoreApiService.northseaTab(naam)
                   │  GET /northsea/tab/{naam}   (AUTH, zelfde als /overzicht)
                   ▼
            backend/axe_api/northsea.py
              TAB_SQL[naam]  ── allowlist, geen vrije SQL
              cache per tab 30 s
                   │  mcp_hub.roep("supabase-axe-commodities", "execute_sql")   (read_only)
                   ▼
            AXE Commodities (Supabase) — bron van waarheid
```

- **Alleen lezen.** Deze tabbladen schrijven niets. Acties die iets veranderen (verzenden,
  goedkeuren, taak aanmaken) lopen via de bestaande paden: `send-approved-reply`, AXE-taken,
  de NorthSea-MCP. Een knop die dat nog niet kan, is er niet of zegt waar het wel kan.
- **Eén plek per regel.** SQL levert ruwe rijen; kleur, status en tellers staan in
  `src/domain/northsea/tabs/*.ts` met tests (zoals chase.ts nu).
- **Geen tweede systeem.** Automation toont AXE-cron (`core_schedules`) en de NorthSea-
  automatiseringsregels (`deal_automation_policy`, `deal_events`); Market Intel gebruikt de
  bestaande koersbron; taken zijn deal_tasks/action_queue plus AXE-taken — geen nieuwe engine.
- **Statuskleuren** volgens UI_COLOR_AND_STATUS/ALERT_ROUTING: rood kritiek, oranje actie,
  geel wachtend, blauw info/lopend, groen alleen geverifieerd/afgerond, paars AI/automatisering,
  grijs neutraal. **Nooit groen voor onbevestigde openbare bron.**
- **Taal:** tekst op het scherm Engels (AGENTS.md), code en commentaar Nederlands zoals de rest.

## 3. De tabbladen

Elk tabblad gebruikt de plaat zoals Live Map: menu links (IcoonZuil), kaartjes bovenin
(DeskKaartjes-materiaal), inhoud in het midden in `--axe-vak`-materiaal, detailpaneel rechts in
de TabRail. AXE Chase blijft op Live Map en Active Deals; de andere tabbladen zetten hun eigen
detailpaneel rechts.

| Tab | Midden | Rechts (detail) | Bron |
|---|---|---|---|
| Active Deals | lijst met zoeken en filters (All / fase) → dealdetail: kop, 9 poorten (buyer…settlement), koper/leverancier/product/waarde-kaarten, samenvatting, mijlpalen uit `deal_events`, volgende acties uit `deal_tasks`/`action_queue`, recente activiteit | Deal Readiness (readiness_score + poorten), tegenpartijen, gerelateerd (aantallen) | opportunities + joins |
| Pipeline | kanban op uitvoering/fase met kolomtellers; lijst-weergave; analytics (aantal per kolom, per product) | — (kaartje opent de deal in Active Deals) | opportunities |
| Counterparties | tabel met zoeken en filters (type, land, verificatie) | bedrijfsdetail: gegevens, contacten, verificatiechecks, deals, bron | companies, contacts, verification_checks |
| Communications | inbox (alle/e-mail/telefoon/intern), zoeken | bericht met richting, deal, intelligentie (classificatie, urgentie, ontbrekende info, red flags), conceptstatus | communications, email_intelligence, reply_drafts |
| Market Intel | koersen die AXE echt heeft; nieuws/kalender alleen als er een bron is, anders "No source connected" | watchlist van dezelfde koersen | fetchMarketSnapshot |
| Documents | lijst met type/deal/status; lege staat nu (0) | documentdetail | deal_documents, inbound_email_attachments |
| Evidence | lijst met type/bron/verificatie | bewijsdetail: claim, bron, status, deal | deal_evidence, verification_checks |
| Automation | NorthSea-regels (policy), recente automatiseringsgebeurtenissen, AXE-cron met NorthSea-scope | beleid: wat mag automatisch, wat nooit | deal_automation_policy, deal_events, /cron/schedules |
| Reports | kerncijfers en verdelingen uit de echte data (fases, producten, landen, verificatie, communicatie) | — | afgeleid |

## 4. Bouwvolgorde en bewijs

Elke stap is pas af met het bewijs ernaast.

| # | Stap | Bewijs |
|---|---|---|
| 0 | Dit plan | staat op de branch |
| 1 | Backend `GET /northsea/tab/{naam}` met allowlist, cache, tests | pytest groen; onbekende tab → 404; echte query geeft rijen |
| 2 | Gateway + types + domeinregels per tab | vitest groen, ook voor "leeg" en "onverifieerd ≠ groen" |
| 3 | Gedeelde bouwstenen (tegels, paneel, statusbadge, lege staat) | typecheck zonder nieuwe fouten |
| 4–12 | De negen tabbladen, één voor één | preview met echte data, screenshot per tab |
| 13 | "3D Maps" heet "Northsea Desk" (route blijft `/maps-3d`) | nav, zoeken en systeemregister tonen de nieuwe naam |
| 14 | Volledige controle | typecheck (niet meer dan de 5 bestaande fouten), vitest, eslint (geen nieuwe), vite build, preview-rondgang |
| 15 | Luka's akkoord → merge naar orchestrator → Mac-mini-app bouwen | pas na expliciet ja |

## 5. Bekende grenzen

- Waarde, commissie en "total deal value" zijn leeg in de data; de desk rekent niets bij.
- Documenten staan nog niet in `deal_documents`; de tab toont de 4 inbound-bijlagen als documenten
  in afwachting van classificatie, niet als geverifieerd bewijs (document ≠ bewijs).
- Er is geen nieuwsbron voor commodities in AXE; Market Intel verzint geen koppen.
- CrewAI-crews komen later (Luka levert ze); de tabbladen tonen wat de crews schrijven zodra het in
  de database staat, en hebben er nu geen afhankelijkheid van.
