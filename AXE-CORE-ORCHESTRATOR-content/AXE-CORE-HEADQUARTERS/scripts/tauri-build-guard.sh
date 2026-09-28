#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"

if [[ "${AXE_CANONICAL_BUILD:-0}" != "1" ]]; then
  cat >&2 <<EOF
AXE CORE has one installable native build.

'npm run tauri:build' is reserved for the canonical updater so feature
work cannot leave another AXE CORE.app for Finder/Spotlight/Dock to launch.

Use:
  npm run tauri:dev      # run feature work
  npm run tauri:check    # compile-check Rust/Tauri
  npm run bijwerken      # build/install the one canonical app (orchestrator)
EOF
  exit 2
fi

if [[ "$branch" != "orchestrator" ]]; then
  echo "Canonical Tauri bundle refused: branch is '$branch', expected 'orchestrator'." >&2
  exit 2
fi

# Alleen de .app: de dmg-stap stuurt Finder aan via AppleScript en faalt vanuit
# launchd (autosync). Het script installeert de .app; de dmg werd nooit gebruikt.
exec npx tauri build --bundles app
