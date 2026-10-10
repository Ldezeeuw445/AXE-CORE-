# Website Review Desk — eigen bronworker

Native vervanger voor de externe uurcontrole die het privérapport `axe_website_review_desk_v1` bijhield.
Code: `backend/axe_api/review_desk_bron.py` (+ `test_review_desk_bron.py`). Draait op de bestaande scheduler:
job `axe-review-desk-sources` in `core_schedules` (`action_type = review_desk`, uitvoerder `mac`, elk uur
08:07–20:07 Amsterdam). Elke run staat in `core_job_runs`.

## Wat een run doet

1. Per bron alleen wat NIEUW is, begrensd: 5 pagina's × 100 per verzameling, cursor per bron, lijst met gezien-id's (3000).
2. Ontdubbelen: een Gmail-bericht, Sites-aanvraag, Stripe-betaling of Metricool-post telt één keer. Een betaling telt op
   het `payment_intent`-id (checkout en factuur voor dezelfde betaling = één); een post op id én inhoud.
3. Promotie binnen de vastgelegde limieten (centraal, over alle uitvoerders): max 2 nieuwe eerste voorstellen per
   Amsterdamse kalenderdag, 20 in totaal, alleen 08:00–20:00, geen herinnering bij stilte, nooit opnieuw benaderen wie zich
   afmeldde of bounceste. Een eerste voorstel herkent de worker aan een verzonden bericht naar een nieuw extern domein.
   `GET /review-desk/limits` (AUTH) geeft de ruimte nu. Onbekende verzenddatums sluiten de ruimte (faalt dicht).
4. Werkt het rapport bij met een voorwaarde op de eerder gelezen `updated_at` (bij een botsing opnieuw lezen en dezelfde
   mutatie op de nieuwste versie, max 3×). Alleen bronnen die gelezen zijn raken hun waarneming aan; bij een fout blijft
   de oude waarde en de oude datum staan en staat de fout bij de eigen kanaalregel **AXE Core source worker**.
   Het bijgewerkte rapport wordt eerst gevalideerd tegen dezelfde grenzen als `reviewDeskSchema`; ongeldig = niets schrijven.

## Wat hij bewust niet doet

- **Geen AI voor lege controles.** De hele sweep roept geen model aan. Alleen een nieuwe inkomende reactie kan een concept
  vragen, uitsluitend bij gratis aanbieders (Groq, modelbox), en alleen met `REVIEW_DESK_CONCEPTEN=1`.
- **Verzendt niets.** Er bestaat in de code geen verzendaanroep. Antwoorden zijn Gmail-concepten (`drafts.create`).
- **Publiceert niets.** Metricool wordt alleen gelezen. `mag_publiceren()` is de poort voor wie ooit publiceert.
- **Claimt geen overname** (zie onder). `Received at last check` (EUR) blijft ongemoeid: netto na btw, kosten en
  terugbetalingen is niet vastgesteld, alleen het aantal bevestigde betaalde gebeurtenissen wordt bijgehouden.

## Overname

Pas bewezen na **twee geslaagde geplande bronruns** (laatste twee `scheduled`-runs, verschillend uur-slot) waarin
**alle vier** de bronnen gelezen zijn, inclusief ontdubbeling en foutafhandeling. Handmatige runs (`POST /review-desk/run`)
tellen niet. De stand staat in het kanaal "AXE Core source worker" ("Overname: NIET bewezen — n/2"). Tot dan blijft de
externe uurcontrole draaien.

## Wat Luka zelf moet afronden (zonder dit zijn de runs `skipped`, geen fout)

| Bron | Toestand 10 okt | Te doen |
|---|---|---|
| Gmail | OAuth-client staat in de kluis; geen refresh-token | `python3 scripts/review-desk-gmail-auth.py` op de Mac en in de browser op Toestaan klikken voor support@axeheadquarters.com |
| Stripe | `STRIPE_SECRET_KEY` in de kluis is een Supabase-sleutel (`sb_secret…`), Stripe weigert hem | Beperkte leessleutel `rk_live_…` (Lezen: Checkout Sessions, PaymentIntents, Charges, Refunds) maken in het Stripe-account met de Review Desk-betaallinks → kluis als `REVIEW_DESK_STRIPE_KEY` |
| Sites | privédashboard geeft 401; `/api/inquiries` is alleen POST; geen leesinterface | Een met een bearer-token beveiligd GET-eindpunt per verzameling (`inquiries`, `payment_events`; antwoord `{rows, next_offset}`) in de ChatGPT-site, → kluis `REVIEW_DESK_SITES_URL` + `REVIEW_DESK_SITES_TOKEN` |
| Metricool | geen token in kluis of VPS | API-token (Instellingen → API, Advanced-abonnement) + userId → kluis `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID` (brand `7244586` is bekend) |

Sleutels komen uit de omgeving, en anders uit de kluis (`AXE_VAULT_ENV`, standaard `/Volumes/EagetSSD/AXE-VAULT/secrets.env`);
alleen de namen in `TOEGESTANE_NAMEN` worden gelezen en nooit gelogd.

## Aan- en uitzetten

```bash
python3 scripts/review-desk-bron-schedule.py          # aan (idempotent op job_key)
python3 scripts/review-desk-bron-schedule.py --uit    # uit; verwijdert niets
curl -s -X POST -H "Authorization: Bearer $(cat ~/.axe/axe-api.key)" localhost:8001/review-desk/run   # één handmatige run
curl -s -H "Authorization: Bearer $(cat ~/.axe/axe-api.key)" localhost:8001/review-desk/limits        # acquisitieruimte
```

Eerst de lokale API de nieuwe code laten draaien (app-herstart door autosync) en dan pas aanzetten: een oudere Mac-API
kent `review_desk` niet en zet de job na vijf fouten zelf uit.

## Staat

`axe_review_desk_state_v1` (zelfde eigenaar, `user_settings`): cursors, gezien-id's, voorstellenlijst (domein, thread,
datum), onderdrukte domeinen, post-hashes, run-historie. Bevat geen berichtteksten en geen sleutels.
