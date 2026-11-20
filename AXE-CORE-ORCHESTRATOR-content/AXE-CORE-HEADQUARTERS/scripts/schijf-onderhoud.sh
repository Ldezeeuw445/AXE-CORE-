#!/usr/bin/env bash
# Schijf-onderhoud, één keer per dag via axe-autosync.sh, op de iMac én de Mac mini.
#
# Luka 20 nov: "de device manager geeft bij beide macs 98% aan". Gemeten op de
# iMac: 17 GB aan oude Chrome-kopieën (com.google.Chrome.code_sign_clone, een
# bekende Chrome-fout die nooit opruimt) en 10 GB uv-cache. Dit ruimt ALLEEN op
# wat altijd veilig is en vanzelf terugkomt:
#   - Chrome code_sign_clone-kopieën, en alleen als Chrome dicht is;
#   - `uv cache prune` (alleen pakketten die niets meer gebruikt).
# Nooit: Downloads, Desktop, Documenten, repo's, app-gegevens.
# Minder dan 15 GB vrij daarna -> één melding in AXE (core_notifications).
set -uo pipefail
VLAG="$HOME/.axe/schijf-onderhoud.dag"
mkdir -p "$HOME/.axe"
[[ "$(cat "$VLAG" 2>/dev/null)" == "$(date +%F)" ]] && exit 0
date +%F > "$VLAG"

vrij_gb() { df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4}'; }
voor="$(vrij_gb)"

if ! pgrep -x "Google Chrome" >/dev/null; then
  for d in /private/var/folders/*/*/X/com.google.Chrome.code_sign_clone; do
    [[ -d "$d" && -O "$d" ]] && find "$d" -mindepth 1 -maxdepth 1 -name 'code_sign_clone.*' -exec rm -rf {} + 2>/dev/null
  done
fi
command -v uv >/dev/null && uv cache prune >/dev/null 2>&1

na="$(vrij_gb)"
echo "$(date '+%F %T')  schijf-onderhoud: ${voor:-?} GB -> ${na:-?} GB vrij"

if [[ -n "${na:-}" && "$na" -lt 15 ]]; then
  HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  ENVF="$HIER/backend/axe_api/.env.local"
  SBU="$(grep -E '^SUPABASE_URL=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")"
  SBK="$(grep -E '^SUPABASE_SERVICE_ROLE(_KEY)?=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")"
  if [[ -n "$SBU" && -n "$SBK" ]]; then
    naam="$(scutil --get ComputerName 2>/dev/null || hostname -s)"
    body="$(python3 -c 'import json,sys; print(json.dumps({"type":"warning","message":sys.argv[1]}))' \
      "$naam has only ${na} GB free after the daily cleanup. Biggest usual suspects: ~/Downloads, ~/Library/Application Support, old simulators. Ask AXE to measure it.")"
    printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SBK" "$SBK" \
      | curl -s -m 15 -o /dev/null -X POST "$SBU/rest/v1/core_notifications" \
          -H @- -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$body" || true
  fi
fi
