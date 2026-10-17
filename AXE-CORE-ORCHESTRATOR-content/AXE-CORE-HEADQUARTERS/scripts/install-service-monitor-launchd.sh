#!/usr/bin/env bash
# Eén onafhankelijke bewaker op de agent-host. Blijft na het sluiten van AXE aan.
set -euo pipefail
[[ "$(uname -s)" == "Darwin" ]] || exit 0
AXE_MONITOR_APP="$(cd "$(dirname "$0")/.." && pwd)"
AXE_MONITOR_PY="$AXE_MONITOR_APP/backend/axe_api/.venv-local/bin/python"
AXE_MONITOR_ENV="${ENV_FILE:-$AXE_MONITOR_APP/backend/axe_api/.env.local}"
[[ -x "$AXE_MONITOR_PY" && -f "$AXE_MONITOR_ENV" ]] || exit 1
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
AXE_MONITOR_PLIST="$HOME/Library/LaunchAgents/com.axe.service-monitor.plist"
AXE_MONITOR_TMP="$(mktemp)"
trap 'rm -f "$AXE_MONITOR_TMP"' EXIT
# plistlib ontsnapt paden met spaties of XML-tekens; geen shell-interpolatie.
"$AXE_MONITOR_PY" - "$AXE_MONITOR_TMP" "$AXE_MONITOR_APP" "$AXE_MONITOR_ENV" "$HOME" <<'PY'
import hashlib, pathlib, plistlib, sys
from dotenv import dotenv_values
target, app, env_file, user_home = sys.argv[1:]
if dotenv_values(env_file).get('AXE_MAC_EXECUTOR') != '1':
    raise SystemExit(0)  # alleen de agent-host; nooit een tweede bewaker op de iMac
version = hashlib.sha256(b''.join(pathlib.Path(app + '/backend/axe_api/' + name).read_bytes()
                                 for name in ('service_monitor.py', 'service_monitor_worker.py', 'push_meldingen.py',
                                             'eigenaar_acties.py'))).hexdigest()[:16]
with open(target, 'wb') as file:
    plistlib.dump({
        'Label': 'com.axe.service-monitor',
        'ProgramArguments': [app + '/backend/axe_api/.venv-local/bin/python', app + '/backend/axe_api/service_monitor_worker.py'],
        'WorkingDirectory': app + '/backend/axe_api',
        'EnvironmentVariables': {'ENV_FILE': env_file, 'AXE_MONITOR_DIR': user_home + '/.axe/monitoring', 'AXE_MONITOR_BUILD': version},
        'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
        'StandardOutPath': user_home + '/Library/Logs/axe-service-monitor.log',
        'StandardErrorPath': user_home + '/Library/Logs/axe-service-monitor.log',
    }, file)
PY
[[ -s "$AXE_MONITOR_TMP" ]] || exit 0
if ! cmp -s "$AXE_MONITOR_TMP" "$AXE_MONITOR_PLIST"; then
  launchctl bootout "gui/$(id -u)/com.axe.service-monitor" 2>/dev/null || true
  cp "$AXE_MONITOR_TMP" "$AXE_MONITOR_PLIST"
  chmod 600 "$AXE_MONITOR_PLIST"
fi
if ! launchctl print "gui/$(id -u)/com.axe.service-monitor" >/dev/null 2>&1; then
  launchctl bootstrap "gui/$(id -u)" "$AXE_MONITOR_PLIST"
fi
