#!/usr/bin/env bash
# Dagelijkse opruimronde op de DAX-host. Alleen wat weg MAG:
#
#   wel:  build cache ouder dan 7 dagen, dangling images, browser-CACHES
#         (Cache, Code Cache, GPUCache, ShaderCache), /tmp in containers
#   nooit: volumes, workspaces, browserprofielen (cookies/logins), artifacts,
#         downloads, home (CLI-logins). Daar is geen retentiebeleid voor, dus
#         daar komt dit script niet aan.
#
# Logs zijn begrensd door daemon.json (20 MB x 3 per container).
# Schrijft één JSON-regel met de stand, zodat /observability of een mens hem kan lezen.
set -uo pipefail

docker builder prune -f --filter until=168h >/dev/null 2>&1
docker image prune -f >/dev/null 2>&1   # alleen dangling; axe-dax-base blijft

for vol in $(docker volume ls -q --filter name=-browser); do
  docker run --rm -v "$vol":/p --entrypoint /bin/sh axe-dax-base:latest -c \
    'rm -rf "/p/Default/Cache" "/p/Default/Code Cache" "/p/Default/GPUCache" "/p/ShaderCache" "/p/GrShaderCache" 2>/dev/null; true' \
    >/dev/null 2>&1
done

for c in $(docker ps -q --filter label=axe.dax=1); do
  docker exec "$c" sh -c 'find /tmp -mindepth 1 -mtime +2 -delete 2>/dev/null; true' >/dev/null 2>&1
done

GEBRUIK=$(df --output=pcent / | tail -1 | tr -dc '0-9')
printf '{"at":"%s","disk_used_pct":%s,"warn":%s,"docker":%s}\n' \
  "$(date -u +%FT%TZ)" "$GEBRUIK" "$([ "$GEBRUIK" -ge 85 ] && echo true || echo false)" \
  "$(docker system df --format '{{json .}}' | paste -sd, | sed 's/^/[/;s/$/]/')"
