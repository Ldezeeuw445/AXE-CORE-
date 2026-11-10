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
mkdir -p "$(dirname "$LOG")"
{
  echo "==== $(date '+%Y-%m-%d %H:%M:%S %Z') ===="
  echo "root=$ROOT"
  if [[ ! -x "$ROOT/node_modules/.bin/vite-node" ]]; then
    echo "REFUSE: $ROOT/node_modules/.bin/vite-node is missing — run npm install in AXE-CORE-HEADQUARTERS" >&2
    exit 1
  fi
  "$ROOT/node_modules/.bin/vite-node" "$ROOT/scripts/trading-team-cycle.mts" --run
} >>"$LOG" 2>&1
