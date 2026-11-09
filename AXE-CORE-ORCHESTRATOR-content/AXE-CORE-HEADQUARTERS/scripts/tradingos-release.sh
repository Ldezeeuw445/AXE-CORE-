#!/usr/bin/env bash
# tradingos-release — zet Trading OS vanzelf live zodra main op GitHub nieuwer
# is dan wat tradingosapp.com draait (Luka, 9 nov: "af = live", niets mag in
# een tak blijven hangen). Aangeroepen door axe-autosync, elke 5 minuten.
#
# Doet alleen iets:
#   - op de Mac die tradingosapp.com serveert (LaunchAgent com.tradingos.web),
#   - met een schone checkout in ~/trading-os-app (of $TRADINGOS_REPO),
#   - als Luka 5 minuten niets aanraakt (of TRADINGOS_NU=1),
#   - en niet opnieuw voor een commit die al eens mislukte.
# Het eigenlijke werk is de repo's eigen scripts/release-mac.sh: login-check,
# typecheck + tests + build, engine-proxy en intel-proxy, de site, en de
# controle dat tradingosapp.com antwoordt en inloggen kan.
#
# Uit:  touch ~/.axe/tradingos-release-uit
# Log:  ~/Library/Logs/tradingos-release.log
set -uo pipefail

REPO="${TRADINGOS_REPO:-$HOME/trading-os-app}"
PLIST="$HOME/Library/LaunchAgents/com.tradingos.web.plist"
LOGMAP="$HOME/Library/Logs"
LOG="$LOGMAP/tradingos-release.log"
MISLUKT="$LOGMAP/tradingos-release.mislukt"
GEDAAN="$LOGMAP/tradingos-release.gedaan"
HEALTH_URL="${TRADINGOS_HEALTH_URL:-http://localhost:8080/health.json}"
mkdir -p "$LOGMAP"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# Eén melding in AXE (core_notifications). De sleutel via stdin, nooit als argument.
meld() {
  local soort="$1" tekst="$2" body
  [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE:-}" ]] || return 0
  body="$(python3 -c 'import json,sys; print(json.dumps({"type":sys.argv[1],"message":sys.argv[2][:1900]}))' "$soort" "$tekst")" || return 0
  printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SUPABASE_SERVICE_ROLE" "$SUPABASE_SERVICE_ROLE" \
    | curl -s -m 15 -o /dev/null -X POST "$SUPABASE_URL/rest/v1/core_notifications" \
        -H @- -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$body" || true
}

[[ -f "$HOME/.axe/tradingos-release-uit" ]] && exit 0
[[ -f "$PLIST" && -d "$REPO/.git" && -f "$REPO/scripts/release-mac.sh" ]] || exit 0

git -C "$REPO" fetch -q origin main 2>/dev/null || exit 0
DOEL="$(git -C "$REPO" rev-parse --short=7 origin/main 2>/dev/null)" || exit 0
LIVE="$(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",""))' 2>/dev/null || true)"
[[ -n "$LIVE" && "${LIVE:0:7}" == "${DOEL:0:7}" ]] && exit 0
# Antwoordt de site even niet, dan niet elke ronde dezelfde commit opnieuw.
[[ -z "$LIVE" && "$(cat "$GEDAAN" 2>/dev/null)" == "$DOEL" ]] && exit 0

# Een commit die al eens mislukte niet elke 5 minuten opnieuw.
[[ "$(cat "$MISLUKT" 2>/dev/null)" == "$DOEL" ]] && exit 0

if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  # Er wordt in die checkout gewerkt; release-mac.sh zou toch weigeren.
  log "main is $DOEL, live is ${LIVE:-?}, maar $REPO heeft open wijzigingen — gewacht"
  exit 0
fi

# Niet bouwen terwijl Luka werkt: een build trekt de 8 GB-Mac leeg.
STIL=$(ioreg -c IOHIDSystem 2>/dev/null | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')
if [[ "${TRADINGOS_NU:-0}" != "1" && "${STIL:-0}" -lt 300 ]]; then
  exit 0
fi

log "live is ${LIVE:-onbekend}, main is $DOEL — release (laagste prioriteit)"
PRIO=()
command -v taskpolicy >/dev/null 2>&1 && PRIO=(taskpolicy -b nice -n 19)
# Schone omgeving: een oude SUPABASE_ACCESS_TOKEN in een shell wint anders van
# `supabase login` (zie release-mac.sh).
if (cd "$REPO" && ${PRIO[@]+"${PRIO[@]}"} env -i HOME="$HOME" USER="${USER:-}" LOGNAME="${USER:-}" SHELL=/bin/zsh \
      TMPDIR="${TMPDIR:-/tmp}" PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
      /bin/bash scripts/release-mac.sh) >> "$LOG" 2>&1; then
  rm -f "$MISLUKT"
  echo "$DOEL" > "$GEDAAN"
  log "klaar: Trading OS live op $DOEL"
  osascript -e "display notification \"Trading OS staat live op $DOEL.\" with title \"Trading OS\"" 2>/dev/null || true
else
  echo "$DOEL" > "$MISLUKT"
  log "release van $DOEL MISLUKT — zie hierboven; de vorige versie blijft live"
  osascript -e "display notification \"Release $DOEL mislukte; de vorige versie blijft live.\" with title \"Trading OS\"" 2>/dev/null || true
  meld warning "Trading OS release of $DOEL failed on $(scutil --get LocalHostName 2>/dev/null || hostname -s); tradingosapp.com stays on ${LIVE:-the previous version}. Log: ~/Library/Logs/tradingos-release.log. It retries on the next commit to main; to retry this one: rm ~/Library/Logs/tradingos-release.mislukt"
fi
exit 0
