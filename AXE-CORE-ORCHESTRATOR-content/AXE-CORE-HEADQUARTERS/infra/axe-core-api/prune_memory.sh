#!/usr/bin/env bash
# Nightly memory retention. Ages out activity-trace entries so recall stays
# fast; preferences, reflections and the ta: trading journal never expire.
# Policy and safety floor live in axe-core-api (/memory/prune).
set -euo pipefail
KEY=$(grep "^AXE_API_KEY=" /opt/axe-core-api/.env | cut -d= -f2-)
UID_="acff7a12-1111-481d-a7a9-cc07583b8069-axe-core"
LOG=/var/log/axe-memory-prune.log
RESULT=$(curl -sS -X POST "http://127.0.0.1:8001/memory/prune?user_id=${UID_}&dry_run=false" \
  -H "Authorization: Bearer ${KEY}" --max-time 120 || echo "{\"error\":\"request failed\"}")
echo "$(date -Is) ${RESULT}" >> "${LOG}"
