#!/usr/bin/env bash
#
# De terminalserver als systemd-dienst, op welke box dan ook.
#
# ## Waarom dit een eigen script is en niet (nog eens) een blok in deploy.sh
#
# De unit stond in `backend/axe_api/deploy.sh` stap 6, en die draait alleen bij
# `ROL=api|alles`. De modelbox kreeg dus nooit een terminalserver, en vak 6 van
# de Terminals-tab bleef dood na een geslaagde bootstrap -- zonder dat er iets
# misging waar je naar kon kijken.
#
# De tweede reden is erger. De unit die daar geschreven werd zette
# `AXE_TERMINAL_PORT` en `WORKSPACE_DIR`, en verder niets. `terminal-server.cjs`
# weigert te starten zonder `SUPABASE_URL` en een projectsleutel -- met opzet:
# "een beveiliging die je per ongeluk uit kunt laten staan is er geen". Zonder
# `EnvironmentFile` stopt het proces dus met exit 1, herstart systemd hem na 3
# seconden, en herhaalt zich dat tot je ernaar kijkt. Het deploy-script zei
# ondertussen "Terminal server: systemctl status axe-terminal" en ging verder.
#
# Daarom hier, één keer, voor allebei: mét de omgeving, en met een controle ná
# het starten in plaats van een regel die zegt waar je zelf kunt kijken.
#
# Gebruik:
#   bash install-axe-terminal.sh <repo-map> [env-bestand] [werkmap]
#
#   repo-map     waar terminal-server.cjs staat (de HEADQUARTERS-map)
#   env-bestand  met SUPABASE_URL + SUPABASE_ANON_KEY (en de allowlist).
#                Default: /opt/axe-core-api/.env
#   werkmap      WORKSPACE_DIR voor de shell. Default: /opt/axe-workspace

set -euo pipefail

TERM_DIR="${1:-}"
ENV_BESTAND="${2:-/opt/axe-core-api/.env}"
WERKMAP="${3:-/opt/axe-workspace}"
UNIT=/etc/systemd/system/axe-terminal.service

if [ -z "$TERM_DIR" ]; then
  echo "install-axe-terminal.sh: geef de repo-map mee" >&2
  echo "  bash install-axe-terminal.sh /opt/axe-core-api/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS" >&2
  exit 2
fi

TERM_JS="$TERM_DIR/terminal-server.cjs"
NODE_BIN="$(command -v node || true)"

if [ -z "$NODE_BIN" ] || [ ! -f "$TERM_JS" ]; then
  echo "⚠️  Terminalserver overgeslagen: $([ -z "$NODE_BIN" ] && echo 'node niet gevonden' || echo "$TERM_JS ontbreekt")."
  echo "   Vak 5/6 van de Terminals-tab verbindt niet tot dit wél draait."
  exit 0
fi

echo "→ Terminalserver (:4022) installeren..."

# `ws` staat niet in de package.json van de repo-root; op de VPS werd hij ooit
# los geïnstalleerd. Dat blijft zo, maar dan wel elke keer gecontroleerd.
( cd "$TERM_DIR" && "$NODE_BIN" -e "require('ws')" 2>/dev/null || npm install ws --no-save --silent )

# ── De omgeving ─────────────────────────────────────────────────────────────
# `EnvironmentFile=-` met een streepje: bestaat het bestand niet, dan start de
# unit alsnog en zegt de server zelf waarom hij weigert. Dat is een leesbare
# fout in het journaal; een unit die niet eens laadt is dat niet.
if [ ! -f "$ENV_BESTAND" ]; then
  echo "   ! $ENV_BESTAND bestaat niet — de server zal weigeren te starten zonder SUPABASE_URL."
fi

cat > "$UNIT" <<UNITEOF
[Unit]
Description=AXE in-app terminal (xterm WebSocket shell)
After=network.target

[Service]
Type=simple
WorkingDirectory=$TERM_DIR
EnvironmentFile=-$ENV_BESTAND
Environment=AXE_TERMINAL_PORT=4022
Environment=WORKSPACE_DIR=$WERKMAP
ExecStart=$NODE_BIN $TERM_JS
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNITEOF

mkdir -p "$WERKMAP"
systemctl daemon-reload
systemctl enable axe-terminal >/dev/null
systemctl restart axe-terminal

# ── En dan kijken of hij het ook deed ───────────────────────────────────────
# Een exit-1 in een herstartlus ziet er in `systemctl start` uit als succes: het
# starten lukte, het blijven draaien niet. Vandaar de pauze en de tweede vraag.
sleep 2
if systemctl is-active --quiet axe-terminal; then
  echo "   ✓ axe-terminal draait."
else
  echo "   ✖ axe-terminal draait NIET. De laatste regels uit het journaal:"
  journalctl -u axe-terminal -n 15 --no-pager || true
  echo ""
  echo "   Staat er 'refusing to start: SUPABASE_URL ...'? Dan mist $ENV_BESTAND"
  echo "   SUPABASE_URL en SUPABASE_ANON_KEY (SUPABASE_SERVICE_ROLE mag ook)."
fi

# ── De allowlist ────────────────────────────────────────────────────────────
# Leeg betekent: elk geldig account van dit Supabase-project krijgt hier een
# shell. Eén project bedient ook Companion en Trading OS, dus dat is elke
# betalende abonnee. De server waarschuwt in zijn log; die leest niemand tijdens
# een bootstrap, dus staat het hier ook.
if ! grep -qE '^AXE_TERMINAL_ALLOWED_USER_IDS=.+' "$ENV_BESTAND" 2>/dev/null; then
  if [ -f "$ENV_BESTAND" ] && ! grep -q '^AXE_TERMINAL_ALLOWED_USER_IDS=' "$ENV_BESTAND"; then
    {
      echo ""
      echo "# Wie hier een shell mag openen. LEEG = elk account van dit Supabase-"
      echo "# project, en dat project bedient ook Companion en Trading OS."
      echo "# Je eigen id: Supabase > Authentication > Users, of"
      echo "#   select id from auth.users where email = 'jouw@mail';"
      echo "AXE_TERMINAL_ALLOWED_USER_IDS="
    } >> "$ENV_BESTAND"
  fi
  echo ""
  echo "   ⚠ AXE_TERMINAL_ALLOWED_USER_IDS is leeg in $ENV_BESTAND."
  echo "     Elk account van dit Supabase-project kan nu een shell openen."
  echo "     Zet je eigen user-id erin en daarna: systemctl restart axe-terminal"
fi
