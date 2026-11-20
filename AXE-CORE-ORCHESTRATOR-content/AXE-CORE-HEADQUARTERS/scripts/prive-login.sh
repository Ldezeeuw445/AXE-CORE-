#!/bin/bash
# Een tweede (derde, vierde) abonnement inloggen in AXE CORE.
#
#   scripts/prive-login.sh claude ~/.claude-tweede
#   scripts/prive-login.sh codex  ~/.codex-tweede
#
# Waarom dit script (Luka 20 nov): "met die claude login voor de tweede hoef ik
# geen account in te vullen, hij zegt meteen dat het goed is". De inlogpagina
# opende in je gewone browser, en die is al ingelogd op account 1 -- dus keurde
# hij account 1 goed, in de map van account 2. Hier opent de pagina in een
# PRIVÉVENSTER (Chrome incognito): geen bestaande sessie, je kiest zelf welk
# account.
#
#   claude: respecteert $BROWSER, dus die wijst naar dit script (--open).
#   codex:  negeert $BROWSER; daarom --device-auth (opent zelf niets) en dit
#           script opent de link die hij print. Daar typ je de code in.
set -u

prive_open() {
  local url="$1"
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --incognito "$url"
  elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --incognito "$url"
  elif [ -d "/Applications/Firefox.app" ]; then
    open -na "Firefox" --args -private-window "$url"
  else
    open "$url"
    echo
    echo "!! Geen browser met privévenster gevonden; de pagina opende in je gewone browser."
    echo "!! Log daar eerst uit bij account 1, of plak de link hierboven in een privévenster."
  fi
}

if [ "${1:-}" = "--open" ]; then
  prive_open "${2:-}"
  exit 0
fi

soort="${1:-}"
map="${2:-}"
if [ -z "$soort" ] || [ -z "$map" ]; then
  echo "gebruik: $0 claude|codex <map>   (bv. claude ~/.claude-tweede)" >&2
  exit 2
fi
map="${map/#\~/$HOME}"
mkdir -p "$map"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# Een sleutel in de omgeving wint van je abonnement; die hoort hier niet.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDECODE OPENAI_API_KEY OPENAI_BASE_URL

echo "Inloggen in $map -- de pagina opent in een privévenster. Kies daar het ANDERE account."
echo

case "$soort" in
  claude)
    BROWSER="$0 --open" CLAUDE_CONFIG_DIR="$map" claude auth login
    echo
    CLAUDE_CONFIG_DIR="$map" claude auth status 2>&1 | grep -E '"loggedIn"|"email"'
    ;;
  codex)
    geopend=""
    CODEX_HOME="$map" codex login --device-auth 2>&1 | while IFS= read -r regel; do
      printf '%s\n' "$regel"
      if [ -z "$geopend" ]; then
        url="$(printf '%s' "$regel" | grep -oE 'https://[^ ]+' | head -1)"
        if [ -n "$url" ]; then prive_open "$url"; geopend=1; fi
      fi
    done
    echo
    CODEX_HOME="$map" codex login status 2>&1 | tail -2
    ;;
  *)
    echo "onbekend: $soort (claude of codex)" >&2
    exit 2
    ;;
esac
