#!/usr/bin/env bash
# PID 1-taak van een DAX-container: niets doen, zuinig wachten op `docker exec`.
# Schrijft één regel bij start zodat `docker logs` laat zien wanneer hij wakker werd.
set -euo pipefail
mkdir -p /dax/workspace/tasks /dax/artifacts/downloads 2>/dev/null || true
echo "dax ${DAX_ID:-?} awake at $(date -u +%FT%TZ)"
trap 'echo "dax ${DAX_ID:-?} going to sleep"; exit 0' TERM INT
while true; do sleep 3600 & wait $!; done
