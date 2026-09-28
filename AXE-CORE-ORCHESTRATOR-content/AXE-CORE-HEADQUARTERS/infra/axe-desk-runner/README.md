# axe-desk-runner — de tradingcyclus 24/7 op de VPS

Headless variant van dezelfde cyclus die de app draait
(`maybeRunTradingAutopilot` in `src/application/tradingIntel/agentAutopilot.ts`).
Geen tweede motor: dezelfde due-check, accounts, pre-trade-poort, sizing en
leerlus. De lease in Supabase (`core_autopilot_lease`, migratie
`supabase/migrations/20260922120000_trading_autopilot_lease.sql`) zorgt dat
desktop, telefoon en VPS nooit tegelijk dezelfde cyclus draaien, en dat een
cyclus (slot = due-minuut) nooit twee keer wordt uitgegeven.

**Niet uitgerold.** Dit vraagt drie besluiten van Luka: de migratie toepassen,
de service-role-sleutel op de VPS zetten, en de runner aanzetten.

## Uitrollen (volgorde telt)

1. Migratie toepassen: `20260922120000_trading_autopilot_lease.sql`.
   Tot dan draait de app zoals voorheen (alleen de in-process vlag) en zegt de
   status "lease table not migrated".
2. Bouwen (lokaal of op de VPS, in `AXE-CORE-HEADQUARTERS/`):
   `npm run build:runner` → `dist-runner/deskRunner.mjs` (één bestand, geen
   node_modules nodig; Node ≥ 20).
3. Op de VPS:
   ```sh
   useradd --system --no-create-home axe-desk
   install -d -o axe-desk /opt/axe-desk-runner
   install -o axe-desk dist-runner/deskRunner.mjs /opt/axe-desk-runner/
   install -m 600 /dev/null /etc/axe-desk-runner.env   # vul hieronder in
   cp infra/axe-desk-runner/*.service infra/axe-desk-runner/*.timer /etc/systemd/system/
   systemctl daemon-reload
   ```
   `/etc/axe-desk-runner.env`:
   ```
   AXE_SUPABASE_SERVICE_ROLE_KEY=…     # dezelfde die axe_api al gebruikt
   AXE_RUNNER_USER_ID=acff7a12-1111-481d-a7a9-cc07583b8069
   AXE_RUNNER_DRY=1                     # eerst droog
   ```
4. Droog draaien: `systemctl start axe-desk-runner` en
   `journalctl -u axe-desk-runner -f`. Elke minuut een `tick`-regel met
   `enabled`, `nextDueAt`, `lease` en `wouldClaimSlot` — er wordt niets
   geclaimd of gehandeld.
5. Echt: `AXE_RUNNER_DRY=1` weghalen, `systemctl restart axe-desk-runner`,
   `systemctl enable --now axe-desk-runner axe-desk-runner-watchdog.timer`.
6. Bureauhartslag (correlatie/gebeurtenisimpact) óók hier? Zet
   `AXE_RUNNER_HEARTBEAT=1` en laat hem in de app dan uit — twee hartslagen
   delen één LSE-uurquotum.

## Status

- `journalctl -u axe-desk-runner` — JSON-regels `started`/`tick`/`tick_failed`.
- `/var/lib/axe-desk-runner/health.json` — laatste tik (instantie, enabled,
  laatste en volgende cyclus, lease-houder, reden van overslaan, laatste resultaat).
- In de app: Trading → Settings → Autopilot toont deze instantie, de volgende
  due-tijd, wie de lease het laatst had en waarom een tik oversloeg.
- `node deskRunner.mjs --check` — exit 1 als de laatste tik ouder is dan 5 min
  (de watchdog-timer herstart de runner dan).

## Veiligheid

- De service-role-sleutel staat alleen in `/etc/axe-desk-runner.env`; de
  bundel bevat alleen de publieke anon-sleutel (gecontroleerd bij de bouw:
  één JWT, rol `anon`). `installServerIdentity` weigert in een browser.
- Orders gaan door dezelfde `brokerPlaceOrder` met dezelfde `PreTradeClearance`
  als in de app; de runner heeft geen eigen orderpad.
- Uitzetten = `systemctl stop axe-desk-runner` of de autopilot-schakelaar in de
  app (de runner leest dezelfde `axe_trading_autopilot_enabled`).
