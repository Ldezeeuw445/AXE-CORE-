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
trap 'rc=$?; printf "\n\033[31m✖ AXE update stopte bij regel %s: %s (exit %s)\033[0m\n" "$LINENO" "$BASH_COMMAND" "$rc" >&2' ERR

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
  stop "Canonical AXE CORE wordt ALLEEN uit '$VERWACHT' gebouwd. Je staat op '$TAK'. Gebruik voor featurewerk npm run tauri:dev of npm run tauri:check; gebruik npm run bijwerken pas nadat het werk in orchestrator zit."
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

zeg "Pakketten (exact uit package-lock)"
npm ci --no-audit --no-fund

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
# Ondertekenen met het eigen certificaat als dat er is (docs/MAC-ONDERTEKENEN.md).
# Zonder: adhoc, en dan vraagt macOS na elke build opnieuw om de SSD -- en tot
# iemand klikt geeft alles wat de kluis leest een 502. Met: één vaste identiteit
# (com.axe.core + dit certificaat), en de toestemming blijft staan. Een
# ingestelde APPLE_SIGNING_IDENTITY gaat altijd voor.
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  for naam in "AXE Core dev" "AXE Core Dev"; do
    if security find-identity -p codesigning 2>/dev/null | grep -q "\"$naam\""; then
      export APPLE_SIGNING_IDENTITY="$naam"
      break
    fi
  done
fi
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  printf '\033[36m▸ Ondertekenen met "%s"\033[0m\n' "$APPLE_SIGNING_IDENTITY"
else
  stop "Geen vast AXE signing-certificaat. Canonical update stopt hier bewust: een adhoc build zou een tweede macOS-identiteit/TCC-set maken. Zie docs/MAC-ONDERTEKENEN.md."
fi

zeg "Native helpers bouwen"
bash infra/computer-worker/native/build.sh
bash infra/computer-worker/camera/build.sh

zeg "Lokale AXE runtime voorbereiden"
SETUP_ONLY=1 bash backend/axe_api/run-local.sh

AXE_CANONICAL_BUILD=1 npm run tauri:build

[[ -d "$APP" ]] || stop "De bouw gaf geen $APP. Lees de uitvoer hierboven."

# ── 4. De oude afsluiten ─────────────────────────────────────────────────────
# Tauri laat geen tweede instantie toe: draait de oude nog, dan lijkt de nieuwe
# gewoon niet te openen en zie je nergens waarom.
if pgrep -f "AXE CORE.app" > /dev/null 2>&1; then
  zeg "De draaiende AXE CORE afsluiten"
  pkill -f "AXE CORE.app" || true
  sleep 1
fi

# ── 4b. En de diensten die hij achterliet ────────────────────────────────────
#
# Dit was een echte valkuil, en een stille. AXE CORE start de terminalserver en
# de API zelf, en ruimt ze op bij afsluiten -- maar die opruimer hangt aan
# Tauri's afsluit-gebeurtenis, en `pkill` hierboven stuurt SIGTERM. Dan gaat de
# app weg zonder dat die handler ooit draait, en blijven zijn kinderen als wees
# achter op hun poort.
#
# Wat je daarna ziet: je bouwt de nieuwe app, hij start op, ziet dat poort 4022
# bezet is en start dus niets. De server die daar luistert is de OUDE. Alles in
# de app is nieuw behalve juist de shell waar je in werkt, en niets zegt dat.
# Precies zo werkte de pty er na een rebuild niet in -- niet omdat de code niet
# klopte, maar omdat de oude nog draaide.
#
# Alleen wat bij DEZE checkout hoort. Op pad matchen en niet op "node" of
# "uvicorn": een andere node-server of een ander project op deze Mac heeft
# hier niets mee te maken en hoort niet om te vallen omdat wij bijwerken.
# Draaide je er zelf een in een eigen venster, dan gaat die hier dus ook uit --
# vandaar dat het erbij staat in plaats van stilletjes te gebeuren.
# Op POORT zoeken en niet op procesnaam. De terminalserver draait als
# `node terminal-server.cjs` -- een relatief pad, dus op naam matchen raakt net
# zo goed een tweede checkout van deze repo. De poort is wat er werkelijk in de
# weg zit, en via de werkmap van dat proces weten we of het van ons is.
for poort in 4022 8001; do
  for pid in $(lsof -ti :"$poort" 2>/dev/null); do
    # De werkmap van het proces. Zit die niet in deze checkout, dan is het
    # iemand anders zijn server en blijft hij staan -- ook als hij toevallig
    # onze poort bezet. Dan zegt de app straks zelf dat de poort bezet is.
    werkmap="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    case "$werkmap" in
      "$HIER"|"$HIER"/*)
        zeg "Achtergebleven dienst op poort $poort afsluiten (pid $pid)"
        kill "$pid" 2>/dev/null || true
        ;;
      */AXE-CORE-HEADQUARTERS|*/AXE-CORE-HEADQUARTERS/*)
        # Canonical AXE owns 4022/8001. An older AXE worktree on the same
        # canonical port is not an unrelated service; leaving it alive makes
        # the newly installed app silently talk to the old runtime.
        zeg "Oude AXE-dienst uit andere worktree op poort $poort afsluiten (pid $pid · $werkmap)"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        [[ -n "$werkmap" ]] && printf '  \033[33m! poort %s is bezet door iets buiten AXE (%s) -- blijft staan\033[0m\n' "$poort" "$werkmap"
        ;;
    esac
  done
done

# ── 4c. canonical launchd-workers ───────────────────────────────────────────
#
# Beide achtergrondworkers worden opnieuw geregistreerd vanuit DEZE canonical
# orchestrator-checkout. Dat maakt hun bronpad onderdeel van dezelfde update als
# de .app en voorkomt dat launchd stil naar een oude worktree blijft wijzen.
zeg "Canonical computer-worker registreren"
bash scripts/install-computer-worker-launchd.sh

zeg "Canonical browser-agent registreren"
bash scripts/install-browser-agent-launchd.sh

# ── 5. Starten ───────────────────────────────────────────────────────────────
# Een zelfgebouwde app is niet ondertekend; zonder dit weigert Gatekeeper hem
# zwijgend en gebeurt er bij dubbelklikken niets.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

# De kopie in /Applications: bijwerken, niet alleen melden.
#
# Tot 16 september werd hij hier nooit aangeraakt, omdat een nieuwe build
# adhoc ondertekend was en macOS hem als een andere app zag. Luka opent AXE
# via Dock en Spotlight -- en die pakten de oude kopie, die dan om toestemming
# vroeg en de wijzigingen van vandaag niet had. Nu elke build met hetzelfde
# certificaat ondertekend is (zie hierboven), blijft de toestemming staan en
# kan de kopie gewoon vervangen worden. Zonder certificaat blijft hij staan,
# want dan zou vervangen juist wel om toestemming vragen.
CANONICAL_APP="/Applications/AXE CORE.app"
zeg "Één canonical app installeren: $CANONICAL_APP"
rm -rf "$CANONICAL_APP"
ditto "$APP" "$CANONICAL_APP"
xattr -dr com.apple.quarantine "$CANONICAL_APP" 2>/dev/null || true
codesign --verify --deep --strict "$CANONICAL_APP" || stop "Canonical AXE CORE signature-verificatie faalde."

VERWACHT_SHA="$(git rev-parse --short HEAD)"
APP_SHA="$(grep -rhoE 'commit:"[0-9a-f]{7,12}"' "$CANONICAL_APP" 2>/dev/null | head -1 | sed 's/.*"\(.*\)"/\1/')"
[[ -n "$APP_SHA" ]] || stop "Canonical app bevat geen build-stempel."
[[ "$APP_SHA" == "$VERWACHT_SHA"* || "$VERWACHT_SHA" == "$APP_SHA"* ]] || stop "Canonical app is uit $APP_SHA gebouwd maar repo staat op $VERWACHT_SHA."

# De release-bundle was vroeger óók Spotlight-startbaar. Na verificatie is
# /Applications de enige gebruikersapp; de build-output blijft geen tweede AXE.
rm -rf "$APP"
APP="$CANONICAL_APP"

zeg "Starten — $(date '+%H:%M') · gebouwd uit $(git rev-parse --short HEAD)"
open "$APP"

# Dezelfde commit staat boven in beeld op Home. Klopt die niet met wat hier
# staat, dan kijk je naar een andere app -- `npm run welke` zegt welke.
printf '\n  In de app staat boven op Home: build %s\n' "$(git rev-parse --short HEAD)"
printf '  Staat er iets anders? Dan draait er een andere kopie: npm run welke\n\n'
printf '  \033[32mCanonical runtime: /Applications/AXE CORE.app + launchd-workers + lokale diensten.\033[0m\n'

echo
echo "Opent hij niet, start hem dan direct om de fout te zien:"
echo "  \"$APP/Contents/MacOS/axe-core\""
