#!/usr/bin/env bash
#
# De terminal-server op DEZE machine, zodat de Terminals-tab hem kan bereiken.
#
# ## Waarom een script en niet `node terminal-server.cjs`
#
# Dat was het advies, en het werkte niet: `ws` stond niet in package.json (alleen
# op de VPS was hij ooit los geïnstalleerd), en de server weigert te starten
# zonder SUPABASE_URL en een projectsleutel -- die staan in .env.local van de
# backend, niet in je shell.
#
# Drie dingen die je moet weten om dit handmatig goed te doen is er twee te veel.
#
# Gebruik:  npm run terminal

set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HIER"

zeg() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
stop() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f terminal-server.cjs ]] || stop "terminal-server.cjs niet gevonden in $HIER"

# ── De omgeving ──────────────────────────────────────────────────────────────
# De server leest SUPABASE_URL (of VITE_SUPABASE_URL) en een projectsleutel.
# Beide staan al in een van deze bestanden; ze hoeven nergens gekopieerd te
# worden. Eerst de backend, want daar staat de service role.
for bestand in backend/axe_api/.env.local .env.local .env; do
  if [[ -f "$bestand" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$bestand"
    set +a
  fi
done

if [[ -z "${SUPABASE_URL:-}${VITE_SUPABASE_URL:-}" ]]; then
  stop "Geen SUPABASE_URL gevonden in backend/axe_api/.env.local, .env.local of .env."
fi

# ── Alleen jouw account ──────────────────────────────────────────────────────
# Leeg betekent: elk geldig account van dit Supabase-project mag hier een shell
# openen. Eén project bedient ook Companion en Trading OS, dus dat is te ruim --
# ook op 127.0.0.1, want een kwaadaardige pagina in een browser op deze machine
# kan localhost gewoon bereiken.
if [[ -z "${AXE_TERMINAL_ALLOWED_USER_IDS:-}" ]]; then
  printf '\n\033[33m! AXE_TERMINAL_ALLOWED_USER_IDS staat leeg — elk account van dit\n'
  printf '  Supabase-project kan hier een shell openen. Zet je eigen user-id in\n'
  printf '  backend/axe_api/.env.local:\n'
  printf '    AXE_TERMINAL_ALLOWED_USER_IDS=<jouw-supabase-user-id>\033[0m\n'
fi

# ── ws ───────────────────────────────────────────────────────────────────────
if [[ ! -d node_modules/ws ]]; then
  zeg "ws ontbreekt — installeren"
  npm install
fi

zeg "Terminal-server op poort ${AXE_TERMINAL_PORT:-4022}"
echo "  Laat dit venster open staan. In AXE Core: tab Terminals → Deze Mac."
echo
exec node terminal-server.cjs
