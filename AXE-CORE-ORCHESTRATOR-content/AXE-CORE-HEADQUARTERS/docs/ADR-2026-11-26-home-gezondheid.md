# ADR: Home-gezondheid eerlijk maken (crons, sleutels, accounts, machines)

**Status:** Accepted (deels; drie punten wachten op Luka, zie Action Items)
**Date:** 2026-11-26
**Deciders:** Luka

## Context

Home toonde rood en geel waar niets kapot was, en verborg wat wel bestond:

- **Apps health** zei "AXE Core: Review Desk ×15 · Planner ×9" en "Trading OS ×39".
  Gemeten: news-ingest werkte (192 berichten per run) maar één van zes bronnen gaf
  `ok:false` en de waarnemer zocht dat overal in het antwoord; Review Desk werd
  *overgeslagen* (wacht op Luka's inlog bij Gmail/Stripe/Sites/Metricool); de
  Planner viel om omdat zijn werkkopie op een losgekoppelde externe SSD stond.
- **AI core** stond geel zodra AXE dacht of sprak; **System** geel bij 99,4% geslaagd.
- **OpenRouter 3/4/5** haalden elke dag ~50 geslaagde verzoeken en kregen daarna 429:
  de vaste gratis daglimiet per account. De keten rustte zo'n sleutel 10 minuten en
  probeerde hem dan opnieuw -- 30 tot 107 verspilde 429's per sleutel per dag.
- **Grok (xAI)** stond in elke keten; Luka gebruikt hem niet.
- **AXON** wijst de sleutel af (401); lezen en schrijven faalden stil.
- **System monitor** toonde 2 machines; de snapshot leverde er al 4, en de derde VPS
  (MT5-bridge) ontbrak.
- **Trading accounts** toonde alleen AXE Core's lijst, zonder te zeggen bij welke app
  een account hoort.

## Decision

1. Een run is geslaagd als het antwoord *bovenaan* `ok` is; falende onderdelen maken
   hem "ok, some parts failing" (migratie `20261126180000_http_outcome_alleen_top_ok`).
2. Op Home is een job alleen kapot als zijn laatste run faalde. `skipped` met een
   teller is een aparte toestand "Waiting".
3. De planner slaat een taak over als de map van zijn repo er niet is, in plaats van
   de hele ronde te laten vallen.
4. AI core is alleen geel bij een wachtende goedkeuring, System op het aandeel
   (onder 98% geel, onder 90% rood).
5. Een **daglimiet**-429 rust tot de reset (`X-RateLimit-Reset`, anders middernacht UTC).
   Een minuutlimiet blijft kort rusten.
6. Grok gaat uit de catalogus en uit elke keten (`UITGEZET`); het id blijft voor oude
   instellingen.
7. Trading accounts in drie blokken: AXE Core · AXE Algo, AXE Companion (nieuw:
   `GET /trading/accounts-per-app`, zonder login of sleutel), Trading OS (eerlijk:
   nog niet leesbaar).
8. System monitor toont alle machines (max 6), boven twee in twee kolommen met ringen
   die meeschalen, zodat vijf machines zonder scrollen passen.

## Options Considered

### OpenRouter: sleutels slimmer roteren
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Nul |
| Capaciteit | Geen winst: de verdeling was al gelijk (3 × ~50) |

**Pros:** voelt als de vraag. **Cons:** lost niets op; de limiet is per account per dag.

### OpenRouter: rusten tot de reset (gekozen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Nul |
| Capaciteit | Gelijk, maar zonder verspilde verzoeken en vertraging; de keten gaat meteen naar Groq/Ollama |

### OpenRouter: $10 tegoed op één account
| Dimension | Assessment |
|-----------|------------|
| Complexity | Nul |
| Cost | $10 eenmalig |
| Capaciteit | 50 -> 1000 gratis verzoeken per dag op dat account |

**Geld: beslissing van Luka.**

## Trade-off Analysis

Meer sleutels van hetzelfde soort helpen alleen als het aparte accounts zijn; de
eerlijke winst zonder geld is ophouden met kloppen op een dichte deur. Voor de
kaarten geldt hetzelfde: liever een eerlijke "Waiting" of "Not readable yet" dan
rood dat niemand kan oplossen.

## Consequences

- Rood op Home betekent weer: er is iets kapot dat je kunt openen en oplossen.
- Een daglimiet kost nog één 429 per sleutel per proces per dag.
- De MT5-bridge toont alleen aan/uit; cijfers vragen leestoegang tot die machine.

## Action Items

1. [x] Waarnemer, Apps health, planner, kerntegels, daglimiet, Grok, accounts per app, machines.
2. [ ] **Luka:** nieuwe AXON-sleutel in Settings (AXON wijst de huidige af, 401).
3. [ ] **Luka:** de 6 AXE Algo-accounts die niet meer aan MetaAPI hangen weghalen (op zijn ja).
4. [ ] **Luka (geld):** $10 OpenRouter-tegoed, of zo laten.
5. [ ] Nieuwsbronnen: GDELT 429, FMP 402 (betaald plan), Newsdata 401 (sleutel) -- Luka's keuze.
6. [ ] Trading OS-accounts leesbaar maken voor AXE (alleen lezen) als Luka dat wil.
