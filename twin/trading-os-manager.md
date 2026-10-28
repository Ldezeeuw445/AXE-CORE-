# Trading OS Manager (account A)
Bijgewerkt: 2026-10-28 09:35 Amsterdamse tijd

## Product
Trading OS = Bloomberg-grade terminal voor de desktop (tradingosapp.com), één ecosysteem met AXE Companion (mobiel), gedeelde Supabase `pqnngpcgbdwxavbatbia`. Repo `Ldezeeuw445/trading-os-app`; integratiebranch `snapshot-2026-10-17`; `main` = `673fa8d` (live sinds 2026-10-27, Mac mini dist via LaunchAgent `com.tradingos.web` + Cloudflare Tunnel). Gedeelde engine `Ldezeeuw445/axe-trading-core` v0.8.0.

## Klaar
T1-T10, P1-P10 (indicatoren, Intel/OSINT, AXE hover-notes, accountunificatie + auth-handoff, slimme alerts, ops/health, deep links, tekeningen-sync, eerlijkheidsronde, golden indicatortests, heatmap/nieuws-fallback, bovenbalk, paneel onder de chart). Migraties + Edge-deploys (auth-handoff v1, engine-proxy v208, alert-eval v2) live op 2026-10-27.

## Nu mee bezig
P11a auto-journal: PR #33 (klaar, 510 tests) -> mergen in snapshot. Migratie `20261027140000_trade_journal_axe_review.sql` NIET uitvoeren.

## Open taken (doet A, tenzij overgedragen)
- PR #33 reviewen/mergen; daarna Luka om ja vragen voor merge naar `main` + Mac-rebuild.
- Daarna volgens Luka's prioriteiten: (2) nieuwsterminal met impact per pair, (3) rijkere Intel-tab, (4) AXE Algo (alleen advies, geen live orders), (5) het beste van TradingView + MT5.
- Entry chunk < 750 kB houden (nu 735 kB) -> lazy-load refactor.

## Kan overgenomen worden door tweeling (B)
- Nieuwsterminal (prioriteit 2) of Intel-tab (prioriteit 3): kies er ÉÉN en zet dat in `twin/trading-os-manager-B.md`, zodat we het niet allebei doen.
- Wekelijkse ideeën voor lancering/promotie (het /workspace-bestand is niet gedeeld; begin opnieuw).

## Wacht op Luka (alleen hij kan dit)
- `AUTH_HANDOFF_PEPPER` zetten (Supabase Edge-secret) -> inloggen via Companion.
- `ALERT_EVAL_SECRET` + vault `alert_eval_*` zetten (of een Supabase-token) -> alert-cron.
- Demo-MT5 investor-login -> echte accountcijfers.
- Ja voor merge naar `main` + Mac-rebuild na PR #33.
- Hostnaam voor `ollama.tradingosapp.com` (nu 404).

## Routines
1. 'Trading OS bouwmotor', elke 3 uur (`CRON_TZ=Europe/Amsterdam 0 */3 * * *`). Volledige instructie:

> Keep the Trading OS build moving forward autonomously, following Luka's master spec (copy at /workspace/tradingos-plan/MASTER_SPEC_TRADING_OS.md; audit at /workspace/tradingos-plan/CURRENT_STATE.md; once merged, the repo's TASKS.json, CURRENT_STATE.md and RUNBOOK.md are the source of truth). Luka explicitly asked for 24/7 continuous work until it's done and working, and then continued improvement.
>
> Repo: https://github.com/Ldezeeuw445/trading-os-app. The integration branch is `snapshot-2026-10-17` (the newest real state). `main` is only touched with Luka's explicit yes.
>
> Each run:
> 1. Look at the cloud agents I launched for this repo and at the open PRs. If an agent is still running, let it be (unless it looks stalled: then steer or relaunch it). If a PR into the integration branch is done: review the diff, check that CI/typecheck/build pass and that it stays within the rules below, then merge it into the integration branch. If it fails, reply to the agent with the fixes.
> 2. If no agent is working on the build, launch one cloud agent on the next highest-priority unblocked task from TASKS.json (phase order T1→T10), starting from the integration branch and opening a PR back into it, with clear acceptance criteria from the spec. Keep at most 2 running at once.
> 3. Check that https://tradingosapp.com and www return 200 with the Trading OS page. If not, check the Mac mini LaunchAgent com.tradingos.web (port 8080) and fix it safely if possible.
> 4. Once a week (on the first run after Monday 09:00 Amsterdam time), add a short list of concrete ideas for the launch, promotion (e.g. LinkedIn) and automations to the report.
>
> Hard rules: never place trades, enable live order execution, connect live broker accounts, move money, change billing/Stripe, rotate secrets, run destructive migrations or delete data, merge to main, or send messages on Luka's behalf. Those all wait for Luka's explicit yes: queue them as an approval request. Don't touch AXE Core, AXE Companion, Northsea Desk or AXON Memory code; coordinate with those managers if work overlaps. Live deploys to the Mac (rebuilding dist) only after Luka has approved a merge to main.
>
> Report to Luka in this chat in short, plain Dutch only when something real happens: a PR merged, a phase completed, a blocker, the site down, or something waiting for his yes. Bundle it into at most one message per run. If nothing meaningful changed, send nothing. Tell Projects Manager (Grok Bot teammate) about real blockers.

2. 'Twin sync Trading OS', 2x per dag (08:30 en 20:30 Amsterdam): werkt dit bestand bij en leest `twin/trading-os-manager-B.md` om overgedragen taken over te nemen.

## Regels
Geen echte trades, geen live orderuitvoering, geen live brokeraccounts, geen geld, geen billing, geen deploys of merge naar `main` zonder Luka's ja. AXE Core/Companion/Northsea/AXON-code niet aanraken. Afstemming gebeurt via dit bestand en het tweelingbestand.
