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
#
# Gewijzigd werk en onbekende bestanden zijn NIET hetzelfde probleem, en dat
# maakte de melding onbruikbaar. Een gewijzigd bestand is werk van jou: daar
# moet dit script vanaf blijven. Een onbekend bestand is meestal uitvoer die er
# gewoon is komen staan -- en daar is "commit of bewaar ze eerst" een antwoord
# waar je niets mee kunt.
#
# Het is één keer misgegaan op de logs die de app ZELF wegschrijft: het script
# blokkeerde erop, en de commit die dat oplost (.gitignore) kon daardoor nooit
# binnenkomen. Nu zegt hij per soort wat je kunt doen, met het commando erbij.
GEWIJZIGD="$(git status --porcelain --untracked-files=no)"
ONBEKEND="$(git ls-files --others --exclude-standard)"

if [[ -n "$GEWIJZIGD" ]]; then
  echo "$GEWIJZIGD" | sed 's/^/    /'
  echo
  stop "Er staat gewijzigd werk. Commit of bewaar het eerst — dit script raakt het met opzet niet aan."
fi

if [[ -n "$ONBEKEND" ]]; then
  printf '\n\033[33m! Deze bestanden kent git niet:\033[0m\n'
  echo "$ONBEKEND" | sed 's/^/    /'
  printf '\n  Is het uitvoer of rommel, haal het weg:\n'
  printf '    rm -rf %s\n' "$(echo "$ONBEKEND" | head -1)"
  printf '  Hoort het erbij, zet het in .gitignore of commit het.\n'
  echo
  stop "Eerst opruimen. Dit script gooit met opzet nooit iets van je weg."
fi

TAK="$(git rev-parse --abbrev-ref HEAD)"
VOOR="$(git rev-parse HEAD)"

# De tak waarop ontwikkeld wordt. Staat je checkout ergens anders, dan haalt
# `git pull origin $TAK` netjes niets binnen en lijkt alles in orde -- terwijl
# je het werk van de laatste dagen niet krijgt. Dat is precies hoe "er is niks
# veranderd" ontstaat, dus het script zegt het hardop.
VERWACHT="orchestrator"
if [[ "$TAK" != "$VERWACHT" ]]; then
  printf '\n\033[33m! Je staat op tak "%s" en niet op "%s".\033[0m\n' "$TAK" "$VERWACHT"
  printf '  Het werk staat op %s. Overstappen met:\n' "$VERWACHT"
  printf '    git checkout %s && npm run bijwerken\n\n' "$VERWACHT"
fi

zeg "Binnenhalen op '$TAK'"
# Vier pogingen met oplopende wachttijd: een haperend netwerk hoort geen
# mislukte update te zijn, maar een echte fout moet wel zichtbaar blijven.
POGING=1; WACHT=2
until git pull origin "$TAK"; do
  (( POGING >= 4 )) && stop "git pull faalde na 4 pogingen."
  echo "   pull faalde — opnieuw over ${WACHT}s"
  sleep "$WACHT"; WACHT=$(( WACHT * 2 )); POGING=$(( POGING + 1 ))
done

# Wat er binnenkwam, met de commits erbij. Zonder dit is een pull die niets
# ophaalde niet te onderscheiden van een pull die alles ophaalde, en dat
# verschil is precies wat je wilt weten voordat je vijf minuten gaat bouwen.
NA="$(git rev-parse HEAD)"
if [[ "$VOOR" == "$NA" ]]; then
  printf '  \033[33mNiets nieuws — je had %s al.\033[0m\n' "$(git rev-parse --short HEAD)"
else
  AANTAL="$(git rev-list --count "$VOOR..$NA")"
  printf '  \033[32m%s nieuwe commit(s):\033[0m\n' "$AANTAL"
  git log --oneline "$VOOR..$NA" | sed 's/^/    /'
fi

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

zeg "Starten — $(date '+%H:%M') · gebouwd uit $(git rev-parse --short HEAD)"
open "$APP"

# Dezelfde commit staat boven in beeld op Home. Klopt die niet met wat hier
# staat, dan kijk je naar een andere app -- `npm run welke` zegt welke.
printf '\n  In de app staat boven op Home: build %s\n' "$(git rev-parse --short HEAD)"
printf '  Staat er iets anders? Dan draait er een andere kopie: npm run welke\n\n'
printf '  \033[36mMoet blijven draaien in een EIGEN venster:\033[0m\n'
printf '    npm run terminal   — de shell-server, anders verbindt de Terminals-tab niet\n'
printf '    backend/axe_api/run-local.sh   — de lokale API, anders geeft de Code Agent 404\n'

echo
echo "Opent hij niet, start hem dan direct om de fout te zien:"
echo "  \"$APP/Contents/MacOS/axe-core\""
