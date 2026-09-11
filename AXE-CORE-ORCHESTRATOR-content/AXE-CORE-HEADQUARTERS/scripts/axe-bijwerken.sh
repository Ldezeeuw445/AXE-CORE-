#!/usr/bin/env bash
#
# Haal binnen, bouw, ruim op, start. Eén commando.
#
# ## Waarom dit bestaat
#
# De reeks was: git pull && npm install && npm run tauri:build, dan zelf de oude
# afsluiten en in Finder de nieuwe zoeken. Vier stappen waarvan je er drie kunt
# vergeten, en de vierde -- welke .app is nu de nieuwe -- was een raadsel omdat
# er drie in dezelfde map staan.
#
# ## Wat het met opzet NIET doet
#
# Het gooit nooit werk van je weg. Staan er lokale wijzigingen, dan stopt het en
# laat het zien wat er is. Geen `git stash`, geen `checkout --`: die twee hebben
# in deze codebase al een keer werk gekost, en "het script deed het" is dan geen
# troost.
#
# Er blijft ALTIJD één app over. Opruimen was eerst een vlag (--schoon) die je
# moest onthouden, en een opruiming die je moet onthouden gebeurt niet. De
# bouwsels die het weghaalt komen uit tauri-configs die niet meer bestaan, dus
# er valt niets te sparen.
#
# Gebruik:  npm run bijwerken

set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HIER"

BUNDEL="src-tauri/target/release/bundle/macos"
APP="$BUNDEL/AXE CORE.app"
zeg() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
stop() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Niets kwijtraken ──────────────────────────────────────────────────────
zeg "Controleren of er onopgeslagen werk staat"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  echo
  stop "Er staan lokale wijzigingen. Commit of bewaar ze eerst — dit script raakt ze met opzet niet aan."
fi

TAK="$(git rev-parse --abbrev-ref HEAD)"
zeg "Binnenhalen op '$TAK'"
# Vier pogingen met oplopende wachttijd: een haperend netwerk hoort geen
# mislukte update te zijn, maar een echte fout moet wel zichtbaar blijven.
POGING=1; WACHT=2
until git pull origin "$TAK"; do
  (( POGING >= 4 )) && stop "git pull faalde na 4 pogingen."
  echo "   pull faalde — opnieuw over ${WACHT}s"
  sleep "$WACHT"; WACHT=$(( WACHT * 2 )); POGING=$(( POGING + 1 ))
done

zeg "Pakketten"
npm install

# ── 2. Oude rommel weg vóór de bouw ──────────────────────────────────────────
# De tijdelijke images van afgebroken dmg-stappen. Die zijn 40 MB per stuk en
# horen er nooit te zijn; ze opruimen is altijd goed.
if compgen -G "$BUNDEL/rw.*.dmg" > /dev/null; then
  AANTAL=$(ls -1 "$BUNDEL"/rw.*.dmg | wc -l | tr -d ' ')
  zeg "$AANTAL achtergebleven dmg-restanten weggooien"
  rm -f "$BUNDEL"/rw.*.dmg
fi

# De experiment-apps uit de oude tauri-configs.
#
# BIJ NAAM, en niet "alles wat geen AXE CORE.app heet". Die eerste versie stond
# er, en die zou een oudere app die je hier bewaart zonder waarschuwing hebben
# opgegeten -- precies wat Luka hier wilde bewaren. Een opruimregel die je niet
# kunt nalezen omdat hij per uitsluiting werkt, gooit ooit iets weg waar niemand
# aan dacht.
#
# Deze drie zijn bouwsels van configs die niet meer bestaan. Alles anders in deze
# map blijft staan, ook als het er niet hoort.
OUDE_BOUWSELS=("AXE CORE Plaat.app" "AXE Lege Plaat.app" "AXE CORE Stage.app")
for oud in "${OUDE_BOUWSELS[@]}"; do
  if [[ -d "$BUNDEL/$oud" ]]; then
    zeg "Weggooien: $oud"
    rm -rf "${BUNDEL:?}/$oud"
  fi
done

# ── 3. Bouwen ────────────────────────────────────────────────────────────────
zeg "Bouwen"
npm run tauri:build

[[ -d "$APP" ]] || stop "De bouw gaf geen $APP. Lees de uitvoer hierboven."

# ── 4. De oude afsluiten ─────────────────────────────────────────────────────
# Tauri laat geen tweede instantie toe: draait de oude nog, dan lijkt de nieuwe
# gewoon niet te openen en zie je nergens waarom.
if pgrep -f "AXE CORE.app" > /dev/null 2>&1; then
  zeg "De draaiende AXE CORE afsluiten"
  pkill -f "AXE CORE.app" || true
  sleep 1
fi

# ── 5. Starten ───────────────────────────────────────────────────────────────
# Een zelfgebouwde app is niet ondertekend; zonder dit weigert Gatekeeper hem
# zwijgend en gebeurt er bij dubbelklikken niets.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

# De kopie in /Applications is van een dmg-installatie en wordt door een bouw
# NOOIT bijgewerkt. Hij heet net zo, dus in Spotlight staan er twee "AXE CORE"
# en pak je soms de verkeerde -- precies waardoor het leek alsof een wijziging
# er niet in zat.
#
# Melden en niet weggooien: dat staat buiten deze repo en is niet aan een
# bouwscript om te beslissen.
if [[ -d "/Applications/AXE CORE.app" ]]; then
  printf '\n\033[33m! Er staat ook een AXE CORE in /Applications. Die wordt hier niet bijgewerkt\n'
  printf '  en verschijnt in Spotlight naast deze. Weghalen met:\n'
  printf '    rm -rf "/Applications/AXE CORE.app"\033[0m\n'
fi

zeg "Starten — $(date '+%H:%M') · $(git rev-parse --short HEAD)"
open "$APP"

echo
echo "Opent hij niet, start hem dan direct om de fout te zien:"
echo "  \"$APP/Contents/MacOS/axe-core\""
