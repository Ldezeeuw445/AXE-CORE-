#!/usr/bin/env bash
# AXE's stem installeren of bijwerken op een Mac (idempotent).
# Venv + model in ~/.axe/tts; app.py wordt daarheen gekopieerd zodat de dienst
# niet afhangt van de staat van een git-checkout.
set -euo pipefail
HIER="$(cd "$(dirname "$0")" && pwd)"
T="$HOME/.axe/tts"
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$T"
[ -x "$T/.venv/bin/python" ] || uv venv --python 3.12 "$T/.venv"
uv pip install --python "$T/.venv/bin/python" -q -r "$HIER/requirements.txt"
for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do
  [ -f "$T/$f" ] || curl -fsSL -o "$T/$f" "$B/$f"
done
cp "$HIER/app.py" "$T/app.py"
cp "$HIER/com.axe.tts.plist" "$HOME/Library/LaunchAgents/com.axe.tts.plist"
launchctl bootout "gui/$(id -u)/com.axe.tts" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.axe.tts.plist"
for i in $(seq 1 30); do curl -fs -m 1 http://127.0.0.1:8766/health && echo && exit 0; sleep 1; done
echo "axe-tts did not come up; see ~/Library/Logs/axe-tts.err.log" >&2; exit 1
