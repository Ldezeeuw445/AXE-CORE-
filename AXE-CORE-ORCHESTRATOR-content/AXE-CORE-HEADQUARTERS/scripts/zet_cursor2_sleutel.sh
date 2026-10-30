#!/usr/bin/env bash
# zet_cursor2_sleutel.sh — de tweede Cursor-stoel (je hotmail-account) aan, zonder de sleutel te tonen.
#
# Waarom (30 okt 2026): Cursor 2 stond in AXE als stoel, maar zonder sleutel. Dan
# weet de worker niet wie het is: geen e-mail op de kaart in Settings, geen
# "ingelogd", en de verdeler slaat hem over. Met CURSOR2_API_KEY meldt de
# worker het account zelf (cursor-agent status), net als bij Claude en ChatGPT,
# en telt Usage & Credits zijn sessies per app.
#
# Op de Mac (iMac, en eventueel ook de Mac mini), in de HQ-map:
#   bash scripts/zet_cursor2_sleutel.sh
#
# De sleutel maak je op cursor.com, ingelogd met je hotmail:
#   Dashboard -> Integrations -> User API Keys -> New
#
# Wat het doet:
#   1. vraagt de sleutel verborgen (niet op het scherm, niet in je geschiedenis);
#   2. vraagt cursor-agent of hij werkt; zo niet, dan verandert er NIETS;
#   3. zet hem in backend/axe_api/.env.local (backup eerst, alleen voor jou leesbaar)
#      en herstart de computer-worker, zodat de kaart binnen een minuut bijwerkt.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="$HIER/backend/axe_api/.env.local"
CURSOR="$(command -v cursor-agent || true)"
[[ -n "$CURSOR" ]] || CURSOR="$HOME/.local/bin/cursor-agent"
if [[ ! -x "$CURSOR" ]]; then
  echo "cursor-agent staat niet op deze Mac. Installeer hem eerst: curl https://cursor.com/install -fsS | bash"
  exit 1
fi

printf 'Plak de Cursor-sleutel van je hotmail-account (je ziet hem niet) en druk op Enter: '
IFS= read -rs T
echo
if [[ -z "$T" ]]; then
  echo "Geen sleutel ingevoerd; er is niets veranderd."
  exit 1
fi

# Via de omgeving van het kind, nooit als argument.
STATUS="$(CURSOR_API_KEY="$T" "$CURSOR" status --format json 2>&1 || true)"
if grep -qiE 'not authenticated|invalid|unauthorized|401' <<<"$STATUS"; then
  echo "Cursor weigert deze sleutel. Er is niets veranderd."
  exit 1
fi
MAIL="$(grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' <<<"$STATUS" | head -1 || true)"
echo "Cursor accepteert de sleutel${MAIL:+ voor $MAIL}."

touch "$ENVF"
cp -p "$ENVF" "$ENVF.bak-cursor2-$(date +%Y%m%d-%H%M%S)"
{ grep -v '^CURSOR2_API_KEY=' "$ENVF" || true; printf 'CURSOR2_API_KEY=%s\n' "$T"; } > "$ENVF.nieuw"
chmod 600 "$ENVF.nieuw"
mv "$ENVF.nieuw" "$ENVF"
unset T

if launchctl print "gui/$(id -u)/com.axe.computer-worker" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/com.axe.computer-worker"
  echo "Computer-worker herstart."
else
  echo "De computer-worker draait hier niet als dienst; hij leest de sleutel bij zijn volgende start."
fi
echo "Klaar. In Settings -> Usage & Credits staat Cursor Pro 2 binnen een minuut met je account erbij."
