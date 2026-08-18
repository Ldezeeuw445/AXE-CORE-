#!/bin/bash
# Stops + removes OpenHands sandbox containers (oh-agent-server-*).
# Two layers:
#  1. Hard concurrency cap — this 6-core/7.7GB VPS cannot handle more than
#     one sandbox running at once (2026-07-28: multiple concurrent sandboxes
#     from repeated test calls hung the entire VPS network stack, twice,
#     requiring a hard Strato reboot each time). Keep only the newest
#     running container, kill the rest immediately regardless of age.
#  2. Age cap — a lone sandbox older than MAX_AGE_MIN is almost certainly
#     an abandoned/orphaned one (OpenHands does not reliably clean these up
#     itself), so it gets reaped too even if it is the only one.
MAX_AGE_MIN=20
now=$(date +%s)

mapfile -t running < <(docker ps --filter "name=oh-agent-server-" --format "{{.ID}} {{.CreatedAt}}" | sort -k2 -r)
if [ "${#running[@]}" -gt 1 ]; then
  for entry in "${running[@]:1}"; do
    id=$(echo "$entry" | awk "{print \$1}")
    echo "$(date -Iseconds) reaping $id (concurrency cap — keeping only the newest sandbox)"
    docker stop "$id" >/dev/null 2>&1
    docker rm "$id" >/dev/null 2>&1
  done
fi

docker ps --filter "name=oh-agent-server-" --format "{{.ID}} {{.CreatedAt}}" | while read -r id created; do
  created_ts=$(date -d "$created" +%s 2>/dev/null) || continue
  age_min=$(( (now - created_ts) / 60 ))
  if [ "$age_min" -gt "$MAX_AGE_MIN" ]; then
    echo "$(date -Iseconds) reaping $id (age ${age_min}m)"
    docker stop "$id" >/dev/null 2>&1
    docker rm "$id" >/dev/null 2>&1
  fi
done
