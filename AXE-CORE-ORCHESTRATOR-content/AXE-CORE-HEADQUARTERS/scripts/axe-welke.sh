#!/usr/bin/env bash
#
# Welke bouw kijk je naar?
#
# ## Waarom dit bestaat
#
# "Er is niks veranderd" is vandaag drie keer gezegd, en drie keer was de vraag
# eronder dezelfde: zit mijn wijziging in de app die voor me staat? Dat was niet
# te zien. Er staan meerdere AXE CORE.app's op deze Mac (een bouw hier, een
# dmg-installatie in /Applications, een oude op een externe schijf), ze heten
# allemaal net zo, en Spotlight kiest er zelf een.
#
# Sinds vite.config.ts de commit in de bundel bakt, staat het antwoord IN de
# app. Dit script leest het eruit -- zonder hem te openen.
#
# ## Wat het niet doet
#
# Niets weggooien en niets bijwerken. Alleen kijken. Wil je bijwerken:
# npm run bijwerken
#
# Gebruik:  npm run welke

set -uo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HIER"

kop() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
let_op() { printf '\033[33m  ! %s\033[0m\n' "$*"; }

# ── Wat staat er in deze map ─────────────────────────────────────────────────
kop "De repo hier"
TAK="$(git rev-parse --abbrev-ref HEAD)"
printf '  tak     %s\n' "$TAK"
printf '  HEAD    %s  %s\n' "$(git rev-parse --short HEAD)" "$(git log -1 --format=%s | cut -c1-64)"

if [[ -n "$(git status --porcelain)" ]]; then
  let_op "Er staan lokale wijzigingen — npm run bijwerken stopt hierop en doet dan NIETS."
  git status --short | sed 's/^/    /'
fi

# Achterlopen is de stille versie van hetzelfde probleem: de bouw klopt met wat
# er lokaal staat, en lokaal klopt niet met wat er gepusht is.
git fetch --quiet origin "$TAK" 2>/dev/null
ACHTER="$(git rev-list --count "HEAD..origin/$TAK" 2>/dev/null || echo '?')"
if [[ "$ACHTER" != "0" && "$ACHTER" != "?" ]]; then
  let_op "Deze map loopt $ACHTER commit(s) achter op origin/$TAK. Doe: npm run bijwerken"
fi

# ── En welke commit zit er in de apps ────────────────────────────────────────
#
# De commit staat als `commit:"abc1234"` in de gebouwde JS-bundel (zie
# BUILD_STAMP in vite.config.ts). grep -r door de .app is traag maar eerlijk:
# de plek van de bundel binnen een Tauri-app is een implementatiedetail en
# hoort hier niet vastgelegd te worden.
kop "De apps op deze Mac"
lees_app() {
  local app="$1"
  local sha
  sha="$(grep -rhoE 'commit:"[0-9a-f]{7,12}"' "$app" 2>/dev/null | head -1 | sed 's/.*"\(.*\)"/\1/')"
  local tijd
  tijd="$(stat -f '%Sm' -t '%d %b %H:%M' "$app" 2>/dev/null || echo '?')"
  if [[ -z "$sha" ]]; then
    printf '  \033[33m%-10s\033[0m %s  %s\n' 'geen stempel' "$tijd" "$app"
    return
  fi
  # Kent deze repo die commit, en is het er een die in de tak zit?
  local staat='onbekend in deze repo'
  if git cat-file -e "$sha^{commit}" 2>/dev/null; then
    if git merge-base --is-ancestor "$sha" "HEAD" 2>/dev/null; then
      local achter
      achter="$(git rev-list --count "$sha..HEAD")"
      staat=$([[ "$achter" == "0" ]] && echo 'actueel' || echo "$achter commit(s) oud")
    else
      staat='van een andere tak'
    fi
  fi
  printf '  %-10s %s  %-22s %s\n' "$sha" "$tijd" "$staat" "$app"
}

GEVONDEN=0
while IFS= read -r app; do
  [[ -z "$app" ]] && continue
  GEVONDEN=1
  lees_app "$app"
done < <(mdfind -name 'AXE CORE' 2>/dev/null | grep -E '\.app$' | sort -u)

if [[ "$GEVONDEN" == "0" ]]; then
  echo "  Spotlight vond niets. Dan alleen de bouw hier:"
  APP="src-tauri/target/release/bundle/macos/AXE CORE.app"
  [[ -d "$APP" ]] && lees_app "$APP" || echo "  (ook die is er niet — nog nooit gebouwd in deze map)"
fi

printf '\n  De app zet dezelfde regel zelf boven in beeld op Home.\n'
