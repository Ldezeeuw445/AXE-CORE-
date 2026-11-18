#!/usr/bin/env bash
# tradingos-desktop — bouwt en installeert "Trading OS.app" opnieuw zodra de
# schil (src-tauri/ in trading-os-app) op main veranderd is. Aangeroepen door
# axe-autosync, elke 5 minuten, direct na tradingos-release.sh.
#
# Waarom alleen bij een schil-wijziging: de app is een venster op
# tradingosapp.com. Elke release van de site staat er vanzelf in (en een open
# venster ziet een nieuwe versie zelf, trading-os-app#101). Alleen het venster
# zelf — titelbalk, toegestane adressen, offline-pagina, icoon — zit in de
# .app, en dat moet net als AXE CORE.app opnieuw gebouwd worden.
#
# Doet alleen iets:
#   - op een Mac waar /Applications/Trading OS.app staat,
#   - met een schone ~/trading-os-app (of $TRADINGOS_REPO),
#   - als Luka 5 minuten niets aanraakt (of TRADINGOS_NU=1),
#   - en niet opnieuw voor een schil die al eens mislukte (tot dit script verandert).
# Draaide de app, dan wordt hij na de installatie opnieuw geopend; het venster
# onthoudt zijn plek en de site zijn sessie.
#
# Uit:  touch ~/.axe/tradingos-desktop-uit
# Log:  ~/Library/Logs/tradingos-desktop.log
set -uo pipefail

REPO="${TRADINGOS_REPO:-$HOME/trading-os-app}"
APP="${TRADINGOS_APP:-/Applications/Trading OS.app}"
LOGMAP="$HOME/Library/Logs"
LOG="$LOGMAP/tradingos-desktop.log"
STAAT="$HOME/.axe/tradingos-desktop"
mkdir -p "$LOGMAP" "$STAAT"

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

[[ -f "$HOME/.axe/tradingos-desktop-uit" ]] && exit 0
[[ "$(uname -s)" == "Darwin" ]] || exit 0
[[ -d "$APP" && -d "$REPO/.git" && -f "$REPO/scripts/desktop-build.sh" ]] || exit 0

git -C "$REPO" fetch -q origin main 2>/dev/null || exit 0
# De tree-hash van src-tauri: verandert alleen als de schil verandert.
DOEL="$(git -C "$REPO" rev-parse origin/main:src-tauri 2>/dev/null)" || exit 0
[[ -n "$DOEL" ]] || exit 0
[[ "$(cat "$STAAT/gebouwd" 2>/dev/null)" == "$DOEL" ]] && exit 0

ZELF="$(shasum "${BASH_SOURCE[0]}" 2>/dev/null | cut -c1-12 || true)"
MERKER="$DOEL ${ZELF:-?}"
[[ "$(cat "$STAAT/mislukt" 2>/dev/null)" == "$MERKER" ]] && exit 0

# Zelfde regel als tradingos-release.sh: CLI-tempbestanden terugzetten, en
# niet bouwen in een checkout waar iemand werkt.
git -C "$REPO" checkout -q -- supabase/.temp 2>/dev/null || true
if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  log "schil op main is ${DOEL:0:12}, maar $REPO heeft open wijzigingen — gewacht"
  exit 0
fi

# Niet bouwen terwijl Luka werkt: een Rust-build trekt de 8 GB-Mac leeg.
STIL=$(ioreg -c IOHIDSystem 2>/dev/null | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')
if [[ "${TRADINGOS_NU:-0}" != "1" && "${STIL:-0}" -lt 300 ]]; then
  exit 0
fi

if ! { git -C "$REPO" checkout -q main 2>/dev/null && git -C "$REPO" merge -q --ff-only origin/main 2>/dev/null; }; then
  log "kon $REPO niet naar origin/main brengen — overgeslagen"
  exit 0
fi

DRAAIDE=0
pgrep -f "$APP/Contents/MacOS/" >/dev/null 2>&1 && DRAAIDE=1

log "schil veranderd (src-tauri ${DOEL:0:12}) — Trading OS.app bouwen (laagste prioriteit)"
RUN="$(mktemp "${TMPDIR:-/tmp}/tradingos-desktop.XXXXXX")"
if (cd "$REPO" && nice -n 15 env -i HOME="$HOME" USER="${USER:-}" LOGNAME="${USER:-}" SHELL=/bin/zsh \
      TMPDIR="${TMPDIR:-/tmp}" PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
      /usr/bin/perl -e 'alarm shift @ARGV; exec @ARGV or die "exec: $!"' "${TRADINGOS_DESKTOP_MAX_S:-3600}" \
      /bin/bash -c 'npm ci --no-audit --no-fund && bash scripts/desktop-build.sh && bash scripts/desktop-install.sh') > "$RUN" 2>&1; then
  cat "$RUN" >> "$LOG"; rm -f "$RUN"
  echo "$DOEL" > "$STAAT/gebouwd"
  rm -f "$STAAT/mislukt"
  log "klaar: Trading OS.app geïnstalleerd met schil ${DOEL:0:12}"
  if [[ "$DRAAIDE" == "1" ]]; then
    osascript -e 'quit app "Trading OS"' 2>/dev/null || true
    sleep 3
    open -a "$APP" 2>/dev/null || true
    log "Trading OS opnieuw geopend met de nieuwe schil"
  fi
  osascript -e 'display notification "De Trading OS-app is bijgewerkt (nieuwe schil)." with title "Trading OS"' 2>/dev/null || true
else
  cat "$RUN" >> "$LOG"
  # De laatste regels zeggen waarom (Rust of Xcode ontbreekt, build-fout). Het
  # build-script print geen sleutels; er wordt er ook geen meegegeven.
  STAART="$(grep -v '^[[:space:]]*$' "$RUN" | tail -n 8 | cut -c1-200 | tr '\n' ' ')"
  [[ "$(wc -c < "$RUN" 2>/dev/null || echo 0)" -gt 0 ]] || STAART="(no output; stopped after ${TRADINGOS_DESKTOP_MAX_S:-3600}s or died at start)"
  rm -f "$RUN"
  echo "$MERKER" > "$STAAT/mislukt"
  log "bouwen van Trading OS.app (schil ${DOEL:0:12}) MISLUKT — de vorige app blijft staan"
  meld warning "Trading OS desktop app rebuild failed on $(scutil --get LocalHostName 2>/dev/null || hostname -s); the installed app keeps the previous shell (the site inside it is current). Last lines: ${STAART:-?} — Log: ~/Library/Logs/tradingos-desktop.log. To retry: rm ~/.axe/tradingos-desktop/mislukt"
fi
exit 0
