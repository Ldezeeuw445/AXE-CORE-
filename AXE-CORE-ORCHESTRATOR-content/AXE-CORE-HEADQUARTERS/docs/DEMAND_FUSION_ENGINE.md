# Demand Fusion Engine — the revenue loop

`backend/axe_api/revenue/` · HTTP at `/revenue/*` · CLI at `python -m revenue.cli`

A deterministic pipeline that turns public evidence of an expensive problem
into a priced micro-offer ladder, a distribution queue, and a ledger that
decides what to kill and what to multiply.

```
harvest ──► fuse ──► stack ──► distribute ──► measure ──► reallocate ──┐
   ▲                                                                   │
   └───────────────────────────────────────────────────────────────────┘
```

| Stage | Module | What it produces |
|---|---|---|
| harvest | `signals.py` | `DemandSignal` — one public post, with its URL |
| fuse | `fusion.py` | `DemandCluster` — same problem, many people, scored 0–100 |
| stack | `offers.py` | `OfferStack` — tripwire → core → stack → depth → retainer |
| distribute | `distribution.py` | `DistributionAsset` — per-channel content, disclosed and tracked |
| measure | `ledger.py` | kill / keep / scale per (offer, tier, channel) |
| reallocate | `ledger.allocate()` | next cycle's effort split, exploration floor reserved |
| orchestrate | `loop.py` | `LoopReport.next_actions` — today's checklist |

---

## What this system will and will not do

**It will**: rank where the money most plausibly is, price a ladder against
stated budgets, generate compliant assets with tracked links, and tell you —
from recorded sales only — which channel to double and which to drop.

**It will not**: post anything anywhere, charge anyone, or promise you a
number. There is no auto-publishing by design: every post goes out under a
human's account, because an engine that posts while you sleep is an engine
that loses your accounts while you sleep.

**On the targets.** $330 is arithmetic: `path_to_target()` tells you the exact
unit mix and, once you have conversion data, the reach it needs. $9,000/month
is a *projection*, and `project_to_target()` refuses to produce one until three
weeks of settled revenue exist, caps assumed growth at 35%/week, and prints its
sample size next to the answer. Neither number is a forecast. Most attempts at
this do not reach $9K; the ones that do usually get there by finding one offer
that converts and running it much longer than felt exciting.

**"Stealth" means faceless, not fake.** No personal brand, no camera, no
audience required — the product name is what the buyer sees. It does not mean
undisclosed promotion, multiple handles, or scraped bulk email, and the code
rejects all three (see *Guardrails*).

---

## 72 hours to the first $330

### Day 0 — evening (about 2 hours)

```bash
cd backend/axe_api

# 1. Harvest. Use the words your buyers use, not category names.
python -m revenue.cli harvest \
  -q "invoice pdf spreadsheet by hand" \
  -q "cold email spf dkim dmarc spam" \
  -q "looking for someone to set up" \
  -s hackernews -s stackexchange -s reddit -s lemmy

# 2. Fuse and read the ranking. Every line is arguable — argue with it.
python -m revenue.cli fuse
```

Pick the top cluster **only if you can deliver its tripwire tomorrow**. If you
cannot, take the next one. `solvability_now` in the score exists for this
decision; overriding it with ambition is the most common way this stalls.

```bash
# 3. Build the ladder and see what the target actually costs.
python -m revenue.cli offer --target 33000
```

Read the `STACK AUDIT` output before anything else. A rung that pays under
$25/h of your time is a rung that will make you quit in week two.

### Day 1 — build the tripwire (4–6 hours)

Build **only** the tripwire and the core rung. Both are artifacts, not
promises:

- Tripwire ($9–29): a checklist or starter file someone can use in ten minutes.
- Core ($39–89): the playbook plus the template that works on their data.

Put both behind a payment link (Stripe Payment Links, Gumroad, Lemon Squeezy —
whichever you can turn on today). Point the tracked URL at that page.

### Day 2 — distribute (3 hours, spread out)

```bash
python -m revenue.cli plan \
  --identity your_handle \
  --url https://your-page.example/kit \
  -c forum_answer -c marketplace_listing -c free_tool
```

Rules the generator enforces and you should not fight:

1. **Warm up first.** Five genuinely useful answers with no link before the
   first answer that mentions your offer.
2. **The answer must survive link removal.** If deleting your link makes the
   post worthless, it was an ad, and it will be treated as one.
3. **One handle per channel.** Forever.
4. **Respect the caps.** They are per day, not per session.

### Day 3 — measure

```bash
python -m revenue.cli ledger-add --offer off_… --tier tier_… \
  --channel forum_answer --reach 900 --clicks 41 --sales 2 --revenue 3798 --minutes 90

python -m revenue.cli status
```

Record **settled** revenue only. Pending and refunded sales are not revenue,
and every downstream decision reads this table.

---

## From spike to floor — the path to a $9K run-rate

Weeks 2–4 are not "more of the same". They are three specific moves, in order:

1. **Kill fast, scale slow.** Run `status` weekly. Kill what the ledger says to
   kill — it will not say so until the sample justifies it (compounding
   channels like `seo_page` and `free_tool` get a deliberately longer rope).
2. **Multiply the winner, not the portfolio.** When one (offer, channel) pair
   is marked `scale`, the next cycle's effort goes there. Resist adding a
   second product; add a second *tier* to the product that already sells.
3. **Add the floor.** Nothing reaches a monthly run-rate on one-off sales
   alone. The retainer rung is what turns a good month into a base — a $99/mo
   rung with 30 subscribers is $2,970/month that does not restart at zero.

Rough arithmetic for the $9,000/month target, at prices this engine generates:

| Mix | Monthly |
|---|---|
| 30 × retainer $99 | $2,970 |
| 25 × core $49 | $1,225 |
| 20 × stack $149 | $2,980 |
| 5 × depth $399 | $1,995 |
| **Total** | **$9,170** |

That is roughly 80 transactions a month across four rungs — not one viral
moment. Whether it is reachable depends entirely on the conversion rate your
ledger actually records, which is why `project_to_target()` will not answer
before it has one.

---

## Guardrails (they will refuse to generate things)

| Rule | Where | Why |
|---|---|---|
| Promotional posts carry a disclosure | `validate_asset()` | FTC endorsement rules and every forum's house rules |
| One identity per channel | `validate_plan()` | sockpuppets end with every account gone |
| No "guaranteed", "risk-free", "make $X", "overnight" | `BANNED_CLAIMS` | unprovable claims → refunds → chargebacks → closed payment account |
| Cold email needs a postal address + opt-out | `build_asset()` | CAN-SPAM; the EU rules are stricter still |
| Daily caps per channel | `build_plan()` | the constraint is how many places will still have you next week |
| Self-promo posts dropped from demand | `fusion.is_noise()` | launch announcements are not demand |
| No projection under 3 weeks of data | `project_to_target()` | a confident number from two data points is worse than none |
| Revenue = recorded settled sales only | `ledger.py` | every decision downstream reads this table |

An asset that violates a hard rule raises `DistributionError` instead of being
generated. That is deliberate: the failure mode this engine is guarding against
is not "too few posts", it is "banned on day nine with no accounts left".

---

## Running it as a service

The engine is mounted into `axe_api` at `/revenue/*` (bearer auth, same as
everything else):

| Route | Purpose |
|---|---|
| `POST /revenue/harvest` | `{queries, sources, offline}` |
| `POST /revenue/fuse` | cluster + rank stored signals |
| `GET /revenue/clusters` | ranked clusters with explanations |
| `POST /revenue/offers` | ladder + routes to target for a cluster |
| `POST /revenue/plan` | distribution assets (400s if they would be non-compliant) |
| `POST /revenue/ledger` · `GET /revenue/ledger` | record / read measured results |
| `GET /revenue/projection` | projection or an honest refusal |
| `POST /revenue/cycle` | one full loop, returns the checklist |
| `GET /revenue/status` | dashboard payload |
| `GET /revenue/channels` | channel rules, caps, warm-up requirements |

**Scheduled cycles.** `core_schedules.action_type = 'revenue'` runs one cycle
on the VPS scheduler (see `20260809_core_revenue_engine.sql`, which widens the
existing CHECK constraint). Payload:

```json
{
  "queries": ["invoice pdf spreadsheet by hand"],
  "identity": "your_handle",
  "base_url": "https://your-page.example/kit",
  "effort_units": 10,
  "notify": true
}
```

With `"notify": true` the next-actions checklist lands in `core_notifications`
each morning. The scheduled cycle re-ranks and re-queues; it never publishes
and never records revenue.

**State.** A JSON file (`REVENUE_STATE_PATH`, default `~/.axe/revenue_state.json`)
is the working copy; when Supabase credentials are present it mirrors to
`core_revenue_*`. The local file is authoritative during a cycle so an
unreachable database cannot lose a run.

---

## The kits — actual products, not just the plan

`revenue/kits/` holds working deliverables, so day 1 is filling in a product
rather than starting one. Both are stdlib-only and run entirely on the buyer's
machine — their trade data never leaves it, which is the first objection every
trader has.

```bash
# The $149 stack rung: broker CSV in, markdown report out
python -m revenue.cli kit-journal --csv their_trades.csv --out report.md

# The $19 tripwire: challenge floors, headroom, position sizing
python -m revenue.cli kit-propfirm --balance 100000 --preset generic_2step \
    --equity 97800 --day-start 99500 --stop 0.0025 --point-value 100000
```

**`journal.py`** maps the header names MT4/MT5/cTrader/TradingView actually
emit, derives each instrument's point value *from the trades themselves* (a
journal mixing EURUSD and NAS100 has point values five orders of magnitude
apart — one global figure makes every FX R-multiple nonsense), and slices by
weekday, entry hour, holding time and symbol. Where a file has no stops it
says so and uses a labelled proxy rather than inventing an R.

**`propfirm.py`** computes the daily and overall floors, says which one is
actually binding, and sizes a position so a full stop-out lands *on* the limit
rather than through it. The sizing ladder's right-hand column — stop-outs
before the limit — is the part that changes behaviour.

Both describe; neither advises. That line is enforced by tests
(`test_report_describes_and_never_advises`), because crossing it turns a tool
into licensed investment advice under MiFID II / RIA rules.

## Tuning it

- **Clustering too coarse / too fine** — `fusion.JACCARD_THRESHOLD`. The seed
  corpus keeps a margin between same-problem pairs (0.20–0.50) and the closest
  different-problem pair (0.17); `test_threshold_margin_holds` fails if a
  lexicon edit closes that gap.
- **Wrong things ranking high** — `lexicon.py`. Weights are small integers and
  `fusion.explain()` names the weakest factor for every cluster, so a bad
  ranking is traceable to a word list rather than a black box.
- **Prices** — `offers.RUNG_DEFAULTS` and `MIN_EFFECTIVE_HOURLY_CENTS`. Stated
  budgets in the evidence override the defaults automatically.
- **Kill/scale bars** — `ledger.KILL_RPM_CENTS`, `SCALE_RPM_CENTS`, `MIN_REACH`,
  and per-channel `kill_min_reach` for compounding assets.

## Tests

```bash
cd backend/axe_api && python -m pytest revenue/ -q     # 72 tests, offline, deterministic
```

The suite that matters most is the last section of `test_revenue.py`: the
engine refuses to project revenue it has not seen, refuses to queue an asset
that would get an account banned, and reports zero revenue until a real sale is
recorded.
