# Go live — instructions for a local agent

This file exists because the session that built the revenue engine runs in a
cloud container: it can write code, but it cannot reach the operator's machine,
their Cloudflare login, or their browser. A **local** Claude Code session on the
Mac can do all three.

Point a local session at this repo and tell it: *"follow
`backend/axe_api/revenue/kits/GO_LIVE.md`"*. Everything below is meant to be
executed, in order, with the results reported back.

Working directory for every command:

```
<repo>/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api
```

---

## 1. Verify the build is sane before publishing anything

```bash
python3 -m pytest revenue/ -q
```

Expect all tests to pass. If any fail, **stop and report** — do not publish a
tool whose maths is failing its own checks. The buyer-facing kits are tested
harder than the rest of the engine for exactly this reason.

## 2. Render the tool and check it locally

```bash
./revenue/kits/deploy.sh --dry-run --out ~/Desktop/journal-tool
open ~/Desktop/journal-tool/journal.html
```

Then drop `revenue/kits/sample_trades.csv` onto the page. It must report:

- 160 trades, net **$3,635.68**, win rate **41.3%**, profit factor **1.28**
- expectancy **$22.72** per trade (**+0.347R**)
- a weekday table where **Friday** is 33 trades, **-$836.10**, 18%

If any of those differ, stop and report the difference. Those numbers are
pinned by `revenue/kits/test_kits.py`; a mismatch on screen but not in the
tests means the rendered page and the Python have drifted.

## 3. Authorise Cloudflare (one time)

```bash
npx wrangler login
```

This opens a browser tab. The human must log in and click **Allow** — do not
attempt to automate the click or enter credentials on their behalf. If the
terminal reports an existing login, skip.

## 4. Publish

```bash
./revenue/kits/deploy.sh
```

The script deploys to Cloudflare Pages, extracts the `*.pages.dev` URL from
wrangler's output, and stores it via `revenue config --set tool_url=…` so
nothing downstream needs the URL typed again.

Confirm it stuck:

```bash
python3 -m revenue.cli config
```

Then open the live URL and repeat the sample-CSV check from step 2 against the
deployed copy, not just the local file.

## 5. Render the daily console

```bash
python3 -m revenue.cli console
```

It opens a page containing today's questions, the answer template with the live
tool URL already in it, the warm-up tracker, the product listing copy, and a
ledger command builder.

## 6. Report back

State plainly:

- the live URL
- whether the deployed page produced the expected numbers
- anything that failed, with the exact error text

---

## What this agent must NOT do

- **Do not post to Reddit, forums, Discord or anywhere else.** Every answer goes
  out under the human's own account, in a thread whose tone only a person can
  judge. Automated posting is what gets the accounts — and therefore the whole
  distribution channel — permanently removed.
- **Do not create a second account, handle or identity anywhere.** One identity
  per channel is enforced in `distribution.validate_plan()` and is not
  negotiable.
- **Do not write revenue into the ledger.** Only settled sales, entered by the
  human, ever go in — every kill/scale decision and every projection reads that
  table, so a single invented row corrupts all of them.
- **Do not add earnings claims, guarantees or "risk-free" language** to any copy.
  `distribution.BANNED_CLAIMS` rejects them, and a test asserts the console's
  generated copy stays clean.
- **Do not enter the human's credentials anywhere**, including Cloudflare,
  Paddle, or a broker. Open the page and hand over.

## Context, if useful

- `docs/DEMAND_FUSION_ENGINE.md` — the full runbook
- `revenue/kits/web.py` — the free tool; note the no-external-requests property
  is load-bearing for the privacy claim on the page
- `revenue/kits/journal.py` — the analysis; point values are derived per symbol
  and R-multiples are meaningless if that changes
