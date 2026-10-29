#!/usr/bin/env bash
# zet_github_token.sh — een nieuwe GitHub-sleutel op de VPS, zonder hem ooit te tonen.
#
# Waarom (29 okt 2026): de GITHUB_TOKEN op de VPS gaf sinds 19 okt 401. De
# bouwende DAX-developer liep er elke ronde op stuk ("could not read Username"),
# en /health zei nog "github": true. Een nieuwe sleutel maken kan alleen Luka;
# dit script doet de rest.
#
# Op de iMac, in de HQ-map:  bash scripts/zet_github_token.sh
#
# Wat het doet:
#   1. vraagt de sleutel verborgen (niet op het scherm, niet in je geschiedenis);
#   2. vraagt GitHub of hij werkt voor Ldezeeuw445/axon-memory en AXE-CORE-;
#      zo niet, dan verandert er NIETS;
#   3. zet hem via ssh-stdin in /opt/axe-core-api/.env (backup eerst), herstart
#      de API en de worker, en laat /health zien.
# De sleutel komt nooit in een argument, een log of een bestand op deze Mac.
set -euo pipefail

HOST="${AXE_VPS_HOST:-root@212.227.91.79}"
KEY="${AXE_VPS_KEY:-$HOME/.ssh/axe-core-vps}"

printf 'Plak de nieuwe GitHub-sleutel (je ziet hem niet) en druk op Enter: '
IFS= read -rs T
echo
if [[ -z "$T" ]]; then
  echo "Geen sleutel ingevoerd; er is niets veranderd."
  exit 1
fi

for repo in axon-memory AXE-CORE-; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 -K - <<<"header = \"Authorization: Bearer $T\"
url = \"https://api.github.com/repos/Ldezeeuw445/$repo\"")"
  if [[ "$code" != "200" ]]; then
    echo "GitHub weigert deze sleutel voor Ldezeeuw445/$repo (HTTP $code). Er is niets veranderd."
    echo "Geef de sleutel toegang tot je repo's: classic met scope 'repo', of fine-grained met Contents en Pull requests (lezen en schrijven)."
    exit 1
  fi
done
echo "GitHub accepteert de sleutel. Nu op de VPS zetten..."

# Het script gaat als argument mee (er staat niets geheims in); de sleutel alleen via stdin.
OP_DE_VPS="$(cat <<'SCRIPT'
set -euo pipefail
IFS= read -r T
f="${AXE_ENV_PAD:-/opt/axe-core-api/.env}"
cp -p "$f" "$f.bak-github-$(date +%Y%m%d-%H%M%S)"
{ grep -v '^GITHUB_TOKEN=' "$f" || true; printf 'GITHUB_TOKEN=%s\n' "$T"; } > "$f.nieuw"
chmod --reference="$f" "$f.nieuw"
chown --reference="$f" "$f.nieuw"
mv "$f.nieuw" "$f"
systemctl restart axe-core-api axe-task-worker
sleep 5
echo "/health: $(curl -s -m 10 http://127.0.0.1:8001/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status"), "github:", (d.get("checks") or {}).get("github"))')"
SCRIPT
)"
printf '%s\n' "$T" | ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "bash -c $(printf '%q' "$OP_DE_VPS")"
unset T
echo "Klaar. De DAX bots gebruiken de nieuwe sleutel bij hun volgende ronde."
