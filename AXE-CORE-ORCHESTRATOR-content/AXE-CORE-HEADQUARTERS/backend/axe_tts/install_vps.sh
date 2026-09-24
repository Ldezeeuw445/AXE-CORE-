#!/usr/bin/env bash
# Eenmalig op de VPS: venv, pakketten en modelbestanden voor axe-tts.
# app.py en axe-tts.service komen daarna via scripts/vps_sync.py deploy.
#   scp backend/axe_tts/requirements.txt root@212.227.91.79:/tmp/axe-tts-requirements.txt
#   ssh root@212.227.91.79 'bash -s' < backend/axe_tts/install_vps.sh
set -euo pipefail
T=/opt/axe-tts
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$T"
[ -x "$T/.venv/bin/python" ] || python3 -m venv "$T/.venv"
"$T/.venv/bin/pip" install -q --upgrade pip
"$T/.venv/bin/pip" install -q -r /tmp/axe-tts-requirements.txt
for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do
  [ -f "$T/$f" ] || curl -fsSL -o "$T/$f" "$B/$f"
done
ls -la "$T" | grep -E "onnx|voices"
"$T/.venv/bin/python" -c "import kokoro_onnx, soundfile, numpy; print('deps ok')"
