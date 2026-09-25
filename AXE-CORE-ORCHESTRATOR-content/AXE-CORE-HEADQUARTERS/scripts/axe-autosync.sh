#!/usr/bin/env bash
# axe-autosync — houdt deze Mac vanzelf gelijk aan de andere.
#
# Draait elke 5 minuten via launchd (com.axe.autosync), op de Mac mini én de iMac.
#   1. Eigen commits op orchestrator die nog niet op GitHub staan → pushen.
#   2. Staat er op GitHub iets nieuws, of is de geïnstalleerde app niet uit
#      de huidige commit gebouwd → axe-bijwerken.sh (bouwen, installeren, starten).
#
# Er is één lijn: orchestrator. Wat daar in staat, staat binnen ~10 minuten op
# beide Macs in /Applications/AXE CORE.app. Onafgemaakt werk (gewijzigde,
# niet-gecommitte bestanden) raakt dit script nooit aan; dan wacht het.
#
# Log: ~/Library/Logs/axe-autosync.log
set -uo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$HIER" rev-parse --show-toplevel)"
APP_STEMPEL="/Applications/AXE CORE.app/Contents/Resources/axe-build-stamp.txt"
SLOT="${TMPDIR:-/tmp}/axe-autosync.lock"
MISLUKT="$HOME/Library/Logs/axe-autosync.mislukt"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Eén tegelijk. Een slot ouder dan 2 uur is van een run die is omgevallen.
if ! mkdir "$SLOT" 2>/dev/null; then
  if [[ -n "$(find "$SLOT" -maxdepth 0 -mmin +120 2>/dev/null)" ]]; then
    rm -rf "$SLOT"; mkdir "$SLOT" || exit 0
  else
    exit 0
  fi
fi
trap 'rm -rf "$SLOT"' EXIT

cd "$REPO" || exit 0
TAK="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$TAK" != "orchestrator" ]]; then
  log "staat op '$TAK', niet op orchestrator — overgeslagen"
  exit 0
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  exit 0  # er wordt nu gewerkt; volgende ronde weer
fi

git fetch -q origin orchestrator || { log "fetch mislukt (offline?)"; exit 0; }

# Eigen werk eerst naar GitHub, zodat de andere Mac het ook krijgt.
if [[ "$(git rev-list --count origin/orchestrator..HEAD)" != "0" ]]; then
  if ! git pull -q --rebase origin orchestrator; then
    git rebase --abort 2>/dev/null
    log "eigen commits botsen met GitHub — handwerk nodig"
    exit 0
  fi
  AXE_PUSH_ORCHESTRATOR=1 git push -q origin HEAD:orchestrator && log "gepusht: $(git log -1 --format='%h %s')"
fi

git merge -q --ff-only origin/orchestrator 2>/dev/null
DOEL="$(git rev-parse --short HEAD)"
GEBOUWD="$(cat "$APP_STEMPEL" 2>/dev/null || true)"
[[ "$GEBOUWD" == "$DOEL" ]] && exit 0

# Is dezelfde commit al eens mislukt, niet elke 5 minuten opnieuw proberen.
if [[ "$(cat "$MISLUKT" 2>/dev/null)" == "$DOEL" ]]; then
  exit 0
fi

# Nooit bouwen terwijl Luka werkt (25 sep): een build trekt de 8 GB-Mac leeg en
# herstart AXE CORE onder zijn handen. Pas na 5 minuten niets aanraken, of
# meteen met AXE_NU=1 (bureaublad: "AXE nu bijwerken").
STIL=$(ioreg -c IOHIDSystem 2>/dev/null | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')
if [[ "${AXE_NU:-0}" != "1" && "${STIL:-0}" -lt 300 ]]; then
  exit 0
fi

log "app is ${GEBOUWD:-onbekend}, code is $DOEL — bouwen (laagste prioriteit)"
if taskpolicy -b nice -n 19 env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" SHELL=/bin/zsh TMPDIR="${TMPDIR:-/tmp}" \
     PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
     /bin/bash "$HIER/scripts/axe-bijwerken.sh" >"$HOME/Library/Logs/axe-autosync-bouw.log" 2>&1; then
  rm -f "$MISLUKT"
  log "klaar: app draait op $DOEL"
else
  echo "$DOEL" > "$MISLUKT"
  log "bouw van $DOEL MISLUKT — zie ~/Library/Logs/axe-autosync-bouw.log"
  osascript -e "display notification \"Update $DOEL kon niet gebouwd worden; de vorige app blijft draaien.\" with title \"AXE CORE\"" 2>/dev/null || true
fi
