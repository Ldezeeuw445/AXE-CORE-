#!/usr/bin/env bash
# Interactive API-key entry for the trading data plane.
# Paste each value at the prompt (or press Enter to skip / keep the current one).
# Values are written straight to .env and never echoed back to the terminal.
set -euo pipefail

ENV=/opt/axe-core-api/.env
cp "$ENV" "$ENV.bak-$(date +%s)"

KEYS=(
  POLYGON_API_KEY
  ALPHAVANTAGE_API_KEY
  TWELVEDATA_API_KEY
  EODHD_API_KEY
  FMP_API_KEY
  FINNHUB_API_KEY
  MARKETSTACK_API_KEY
  SEC_API_KEY
  EIA_API_KEY
  PERIGON_API_KEY
  ZENSERP_API_KEY
  FRED_API_KEY
)

for K in "${KEYS[@]}"; do
  CUR=$(grep "^${K}=" "$ENV" | cut -d= -f2- || true)
  if [ -n "$CUR" ]; then
    printf "%-24s [already set — Enter to keep]: " "$K"
  else
    printf "%-24s : " "$K"
  fi
  read -r VAL
  [ -z "$VAL" ] && continue
  if grep -q "^${K}=" "$ENV"; then
    python3 - "$ENV" "$K" "$VAL" << "PY"
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out = [f"{key}={val}" if l.startswith(f"{key}=") else l for l in lines]
open(path, "w").write("\n".join(out) + "\n")
PY
  else
    echo "${K}=${VAL}" >> "$ENV"
  fi
  echo "  saved."
done

chmod 600 "$ENV"
echo
echo "Restarting axe-core-api…"
systemctl restart axe-core-api
sleep 3
systemctl is-active axe-core-api
echo "Done. Ask Claude to verify which tools went live."
