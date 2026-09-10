#!/usr/bin/env bash
#
# run-local.sh — start axe_api on this machine, for Branch C.
#
# Why this exists rather than "just run uvicorn": three things in this repo
# stop that from working on a Mac, and all three were measured, not guessed.
#
#   1. backend/axe_api/.venv is half-filled (fastapi, uvicorn, playwright — no
#      dotenv, supabase or httpx), so main.py cannot import from it.
#   2. The system python3 here is 3.9, but osint/http_client.py uses `X | None`
#      as a runtime annotation, which needs 3.10+. The service does not run on
#      3.9 at all.
#   3. requirements.txt is unsatisfiable on 3.11+: browser-use activates at
#      that version and wants websockets>=15.0.1, while the file pins <15.
#      browser-use is not needed to serve the API, so it is left out here.
#
# This script does NOT change the project's own .venv or requirements.txt. It
# builds a separate .venv-local with uv, and leaves your setup alone.
#
# Usage:
#   cp .env.local.example .env.local     # fill in SUPABASE_SERVICE_ROLE
#   ./run-local.sh
#
set -euo pipefail
cd "$(dirname "$0")"

VENV=".venv-local"
ENV_FILE="${ENV_FILE:-.env.local}"
PORT="${PORT:-8001}"          # same port nginx proxies to on the VPS
HOST="${HOST:-127.0.0.1}"     # loopback only: this speaks for your machine

# ── env ───────────────────────────────────────────────────────────────────────
# A relative ENV_FILE is relative to this script's directory (we cd'd there);
# an absolute one is used as given. Sourcing "./$ENV_FILE" broke the second
# case, which is the one an override actually uses.
case "$ENV_FILE" in /*) ;; *) ENV_FILE="$PWD/$ENV_FILE" ;; esac
if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE. Copy .env.local.example to it and fill in the values." >&2
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

missing=()
for v in AXE_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing in $ENV_FILE: ${missing[*]}" >&2
  echo "SUPABASE_SERVICE_ROLE is not in the frontend .env on purpose — it is a" >&2
  echo "server-only secret. Get it from the Supabase dashboard." >&2
  exit 1
fi

# WORKSPACE_DIR defaults to /opt/axe-workspace, which does not exist here and
# main.py creates it at import time — so give it somewhere writable instead.
export WORKSPACE_DIR="${WORKSPACE_DIR:-$PWD/.workspace-local}"
mkdir -p "$WORKSPACE_DIR"

# ── the point of the whole exercise ───────────────────────────────────────────
# Branch C's runner strips these before it starts the CLI, so a key here would
# not actually be used. Say so anyway: a key sitting in the environment of a
# service that spawns Claude Code is worth knowing about, not worth silence.
for k in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN; do
  if [ -n "${!k:-}" ]; then
    echo "note: $k is set in this environment. claude_runner strips it before" >&2
    echo "      starting the CLI, so runs still use your \`claude login\` session." >&2
  fi
done

if [ -z "${CLAUDE_CODE_REPOS:-}" ]; then
  echo "note: CLAUDE_CODE_REPOS is empty, so /claude/run will refuse every call." >&2
  echo "      Set it in $ENV_FILE, e.g. axe-core=\$HOME/AXE-CORE-" >&2
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "note: the \`claude\` CLI is not on PATH — /claude/run will say so honestly," >&2
  echo "      but nothing will run. npm i -g @anthropic-ai/claude-code" >&2
fi

# ── venv ──────────────────────────────────────────────────────────────────────
if [ ! -x "$VENV/bin/python" ]; then
  command -v uv >/dev/null 2>&1 || {
    echo "uv is not installed, and python3 here is too old to build this venv." >&2
    echo "See https://docs.astral.sh/uv/ — or use any python 3.12 you have." >&2
    exit 1
  }
  echo "Building $VENV (python 3.12, without browser-use — see the header)…"
  uv venv --python 3.12 "$VENV"
  grep -v browser-use requirements.txt > "$VENV/requirements-local.txt"
  uv pip install --python "$VENV/bin/python" -r "$VENV/requirements-local.txt"
fi

echo
echo "axe_api on http://$HOST:$PORT"
echo "  repos : ${CLAUDE_CODE_REPOS:-(none — /claude/run will refuse)}"
echo "  check : curl -H \"Authorization: Bearer \$AXE_API_KEY\" http://$HOST:$PORT/claude/repos"
echo "  app   : set AXE_CORE_API_PROXY_TARGET=http://$HOST:$PORT in the frontend .env, then npm run dev"
echo
exec "$VENV/bin/python" -m uvicorn main:app --host "$HOST" --port "$PORT" "$@"
