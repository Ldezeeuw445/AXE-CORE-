# AXE Companion Manager (A) — twin-overdracht

_Laatst bijgewerkt: 2026-10-28 (Europe/Amsterdam)_

## Wie
- **AXE Companion Manager (account A).**
- Tweeling: **"AXE Companion Manager (B)"**, die schrijft in `twin/axe-companion-manager-B.md`.

## Regels
- Geen productie-deploy, live DB-migraties, billingwijzigingen of data verwijderen zonder Luka's ja.
- Mergen naar `main` van AXE-COMPANION-OS- deployt nu automatisch naar IONOS. Pushes onder `node/metaapi-streamer` redeployen Railway.
- Niet aankomen aan AXE Core of Northsea Desk.

## Bezig nu
- **PR #124 (landingspagina):** klaar. Wacht op Luka's keuze: eerst watcher/push/journal repareren, of live met de kanttekeningen.
- **Cloud agent bc-e5fa3fe4:** PR met circuit breaker/backoff voor de streamer. Oorzaak van ~448k 403/429-verzoeken op Cloudflare `axe-chart-edge`: de Railway-streamer heeft `WORKER_URL` nog op chart.axecompanion.com en een niet-kloppende `STREAMER_SECRET`. Wacht op Luka's ja voor: Railway-env aanpassen, WAF-blokkade, merge.
- **Beveiliging:** 14 `public.core_*`-tabellen met een anon `ALL true`-policy in Supabase `pqnngpcgbdwxavbatbia`. Wacht op Luka's ja, samen met AXE CORE Manager.

## Open taken
- [ ] Watcher schrijft geen `axe_proactive_events` sinds 28 sep.
- [ ] journal-sweep: 0 `trade_journal_labels`.
- [ ] Push: 0 `push_subscriptions`; testen op een echte telefoon.
- [ ] Tabel `axe_memories` ontbreekt.
- [ ] Drawdown-alert per firm bouwen.
- [ ] Founderprijs €40 vs €45.
- [ ] Stripe-testaankoop.
- [ ] Supabase Auth: GraphQL voor anon uit + leaked-password protection.
- [ ] X-Cron-Secret roteren.
- [ ] Draft-PR #105 sluiten.
- [ ] trading-core v0.7.0 importeren (geblokkeerd: Cursor GitHub-app heeft geen toegang tot axe-trading-core) en `drawing.source='companion'` zetten.
- [ ] RLS-policies die alleen `true` zijn op `mt5_closed_positions` en `intel_correlations`.
- [ ] Fases C5/C7/C8/C10.
- [ ] Upcomers-koppeltest door Luka.

## Werkverdeling-voorstel
- **A:** review/merge van Claude's autopilot + security/infra-fixes (streamer, Cloudflare, Supabase).
- **B:** app-bugs: watcher, journal-sweep, push, `axe_memories`, drawdown-alert.
- Markeer geclaimde taken met **[A]** of **[B]**.

## Routines

### 1. AXE Companion: dagelijkse bouw- en Claude-check
Schema: dagelijks rond 09:00 Europe/Amsterdam. Volledige instructie:

```
Daily AXE Companion launch-driver for Luka (repo Ldezeeuw445/AXE-COMPANION-OS-, main is canonical; Supabase pqnngpcgbdwxavbatbia; prod on IONOS www.axecompanion.com; master plan phases C0–C10 in my attachments and /workspace/companion-plan/tasks.json).
1. Check what Claude did since the last run: new commits on claude/* branches, new or updated PRs, pushes to main or deployed, and the repo's docs/BOUWLIJST-COMPANION-LAUNCH.md. Review that work against main and the master plan: does it build, does it conflict with or duplicate what my cloud agents did, does it keep #106–#108 (chart WS, market-proxy auth, no Vercel), does it touch anonymous auth, billing, or data deletion? If Claude work is on a branch that isn't in main yet, get it reconciled into a PR into main via a cloud agent (merge main in, resolve conflicts, run tsc/test/verify/build).
2. Check open PRs into main (mine and reconciled Claude work). Luka gave standing permission (2026-10-17) to merge green PRs into main myself: merge a PR when its tsc/lint/test/verify/build are green and it doesn't change billing, delete data, or alter anonymous-auth behaviour without Luka's decision; otherwise collect it for his yes.
3. Keep the work moving: if there's no active cloud agent on the next unblocked phase in tasks.json, start one (PR into main, no deploy). Update tasks.json.
4. Never deploy to production, apply live DB migrations, change billing, or delete data without Luka's explicit yes in chat; never touch AXE Core or Northsea Desk.
Report to Luka in this chat in short, plain Dutch: what Claude did, what I checked and fixed, what got merged, and any yes I need from him (as a question). If nothing changed and nothing is needed, send nothing.
```

### 2. AXE Companion: twin-sync
Schema: 08:30 en 20:30 Europe/Amsterdam. Werkt dit bestand bij, leest `twin/axe-companion-manager-B.md` en neemt taken over die B overdraagt of niet kan doen.
