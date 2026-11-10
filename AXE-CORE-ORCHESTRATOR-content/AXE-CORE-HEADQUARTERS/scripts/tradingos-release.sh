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

# Wacht hij langer dan een uur om dezelfde reden, dan één melding in AXE, zodat
# het ook op afstand te zien is (10 nov: een release bleef stil hangen).
WACHT="$HOME/.axe/tradingos-release-wacht"
meld_wacht() {  # $1 = reden
  mkdir -p "$WACHT"
  local nu sinds
  nu="$(date +%s)"
  if [[ "$(cat "$WACHT/reden" 2>/dev/null)" != "$1" ]]; then
    printf '%s' "$1" > "$WACHT/reden"; printf '%s' "$nu" > "$WACHT/sinds"; rm -f "$WACHT/gemeld"
    return
  fi
  sinds="$(cat "$WACHT/sinds" 2>/dev/null || echo "$nu")"
  if (( nu - sinds >= 3600 )) && [[ "$(cat "$WACHT/gemeld" 2>/dev/null)" != "$1" ]]; then
    meld warning "Trading OS release waits for $(( (nu - sinds) / 3600 ))h on $(scutil --get LocalHostName 2>/dev/null || hostname -s): $1. tradingosapp.com stays on ${LIVE:-the previous version}."
    printf '%s' "$1" > "$WACHT/gemeld"
  fi
}
niet_meer_wacht() { rm -rf "$WACHT"; }

[[ -f "$HOME/.axe/tradingos-release-uit" ]] && exit 0
[[ -f "$PLIST" && -d "$REPO/.git" && -f "$REPO/scripts/release-mac.sh" ]] || exit 0

git -C "$REPO" fetch -q origin main 2>/dev/null || exit 0
DOEL="$(git -C "$REPO" rev-parse --short=7 origin/main 2>/dev/null)" || exit 0
LIVE="$(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit",""))' 2>/dev/null || true)"
[[ -n "$LIVE" && "${LIVE:0:7}" == "${DOEL:0:7}" ]] && exit 0
# Antwoordt de site even niet, dan niet elke ronde dezelfde commit opnieuw.
[[ -z "$LIVE" && "$(cat "$GEDAAN" 2>/dev/null)" == "$DOEL" ]] && exit 0

# Een commit die al eens mislukte niet elke 5 minuten opnieuw. De merker draagt
# ook de versie van dit script: een reparatie hier probeert dezelfde commit nog één keer.
ZELF="$(shasum "${BASH_SOURCE[0]}" 2>/dev/null | cut -c1-12 || true)"
MERKER="$DOEL ${ZELF:-?}"
[[ "$(cat "$MISLUKT" 2>/dev/null)" == "$MERKER" ]] && exit 0

# De Supabase CLI herschrijft supabase/.temp/* bij elke run. Tot 10 nov stonden
# die in git, en dan leek de checkout 'vuil' en weigerde release-mac.sh. Terugzetten
# is veilig: het zijn geen bestanden van iemand.
git -C "$REPO" checkout -q -- supabase/.temp 2>/dev/null || true
if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  # Er wordt in die checkout gewerkt; release-mac.sh zou toch weigeren.
  log "main is $DOEL, live is ${LIVE:-?}, maar $REPO heeft open wijzigingen — gewacht"
  meld_wacht "uncommitted changes in $REPO ($(git -C "$REPO" status --porcelain --untracked-files=no | head -3 | awk '{print $2}' | tr '\n' ' ')). Fix: git -C $REPO status, then commit, stash or git checkout -- ."
  exit 0
fi

# Niet bouwen terwijl Luka werkt: een build trekt de 8 GB-Mac leeg.
STIL=$(ioreg -c IOHIDSystem 2>/dev/null | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')
if [[ "${TRADINGOS_NU:-0}" != "1" && "${STIL:-0}" -lt 300 ]]; then
  exit 0
fi

niet_meer_wacht
# Eerst bijwerken, zodat de release-mac.sh die draait die van main is en niet
# een oudere die nog op schijf staat (10 nov: de oude deployde intel-proxy niet).
git -C "$REPO" checkout -q main 2>/dev/null && git -C "$REPO" merge -q --ff-only origin/main 2>/dev/null \
  || log "kon $REPO niet naar origin/main brengen; release-mac.sh probeert het zelf"
log "live is ${LIVE:-onbekend}, main is $DOEL — release (laagste prioriteit)"
# Alleen nice, geen taskpolicy -b: achtergrond-QoS knijpt de CPU zo hard dat de
# tests in release-mac.sh op hun tijdslimiet kunnen stuklopen. Luka is toch 5 min weg.
PRIO=(nice -n 15)
# Schone omgeving: een oude SUPABASE_ACCESS_TOKEN in een shell wint anders van
# `supabase login` (zie release-mac.sh).
RUN="$(mktemp "${TMPDIR:-/tmp}/tradingos-release.XXXXXX")"
if (cd "$REPO" && ${PRIO[@]+"${PRIO[@]}"} env -i HOME="$HOME" USER="${USER:-}" LOGNAME="${USER:-}" SHELL=/bin/zsh \
      TMPDIR="${TMPDIR:-/tmp}" PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
      /usr/bin/perl -e 'alarm shift @ARGV; exec @ARGV or die "exec: $!"' "${TRADINGOS_RELEASE_MAX_S:-2700}" \
      /bin/bash scripts/release-mac.sh) > "$RUN" 2>&1; then
  cat "$RUN" >> "$LOG"; rm -f "$RUN"
  rm -f "$MISLUKT"
  echo "$DOEL" > "$GEDAAN"
  log "klaar: Trading OS live op $DOEL"
  osascript -e "display notification \"Trading OS staat live op $DOEL.\" with title \"Trading OS\"" 2>/dev/null || true
else
  cat "$RUN" >> "$LOG"
  # De laatste regels van release-mac.sh zeggen waarom (stap en foutmelding);
  # die gaan mee in de melding, zodat het ook op afstand te zien is. Het script
  # print alleen namen van variabelen, nooit waarden.
  STAART="$(grep -v '^[[:space:]]*$' "$RUN" | tail -n 8 | cut -c1-200 | tr '\n' ' ' )"
  # Een stap die blijft hangen (bijv. een keychain-vraag die niemand ziet) wordt
  # na 45 min afgebroken; de laatste regels laten zien welke stap het was.
  [[ "$(wc -c < "$RUN" 2>/dev/null || echo 0)" -gt 0 ]] || STAART="(no output; stopped after ${TRADINGOS_RELEASE_MAX_S:-2700}s or died at start)"
  rm -f "$RUN"
  echo "$MERKER" > "$MISLUKT"
  log "release van $DOEL MISLUKT — zie hierboven; de vorige versie blijft live"
  osascript -e "display notification \"Release $DOEL mislukte; de vorige versie blijft live.\" with title \"Trading OS\"" 2>/dev/null || true
  meld warning "Trading OS release of $DOEL failed on $(scutil --get LocalHostName 2>/dev/null || hostname -s); tradingosapp.com stays on ${LIVE:-the previous version}. Last lines: ${STAART:-?} — Log: ~/Library/Logs/tradingos-release.log. It retries on the next commit to main; to retry this one: rm ~/Library/Logs/tradingos-release.mislukt"
fi
exit 0
