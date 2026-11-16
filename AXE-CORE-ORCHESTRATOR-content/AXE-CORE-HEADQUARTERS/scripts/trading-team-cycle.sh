#!/bin/bash
# Allowlist-safe Trading Team TEST cycle for the Mac executor.
# Only the MT5 DEMO 500K account may trade: fail-closed allowlist + live MetaAPI tradeMode check.
# Do not point this at a live / Upcomers account. Do not widen the allowlist env.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PORT="${PORT:-5000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${AXE_TRADING_TEAM_CYCLE_LOG:-$HOME/Library/Logs/axe-trading-team-cycle.log}"
cd "$ROOT"
# The Mac API process may have been started with an older AUTO_EXECUTE value
# in its environment. Vite does not override existing process.env from .env,
# so an inherited 0 would silently skip demo orders. Export only the Trading
# Team keys from Headquarters .env (values are never printed).
if [[ -f "$ROOT/.env" ]]; then
  eval "$(python3 "$ROOT/scripts/_trading-team-export-env.py")"
fi
mkdir -p "$(dirname "$LOG")"

# Everything still goes to the log. But when the cycle fails, a short redacted tail also goes to
# stderr, because the job runner stores stderr in core_job_runs.error. Until 2026-11-16 that
# field only said "exit=1": 22 failed runs and nobody could see why.
RUN_OUT="$(mktemp "${TMPDIR:-/tmp}/axe-trading-team-cycle.XXXXXX")"
trap 'rm -f "$RUN_OUT"' EXIT
set +e
(
  echo "==== $(date '+%Y-%m-%d %H:%M:%S %Z') ===="
  echo "root=$ROOT"
  if [[ ! -x "$ROOT/node_modules/.bin/vite-node" ]]; then
    echo "REFUSE: $ROOT/node_modules/.bin/vite-node is missing — run npm install in AXE-CORE-HEADQUARTERS" >&2
    exit 1
  fi
  "$ROOT/node_modules/.bin/vite-node" "$ROOT/scripts/trading-team-cycle.mts" --run
) >"$RUN_OUT" 2>&1
RC=$?
set -e
cat "$RUN_OUT" >>"$LOG"
if [[ "$RC" -ne 0 ]]; then
  echo "trading-team-cycle failed (exit $RC), log tail:" >&2
  python3 "$ROOT/scripts/_trading-team-redact.py" <"$RUN_OUT" >&2 || echo "(log tail unavailable)" >&2
fi
exit "$RC"
