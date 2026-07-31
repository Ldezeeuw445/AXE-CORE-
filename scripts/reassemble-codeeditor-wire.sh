#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import base64
from pathlib import Path
parts = sorted(Path("scripts/codeeditor-wire-b64").glob("part*.b64"))
if not parts:
    raise SystemExit("no b64 parts")
data = "".join(p.read_text().strip() for p in parts)
text = base64.b64decode(data).decode("utf-8")
if "DesignAgentWireHost" not in text:
    raise SystemExit("decoded content missing DesignAgentWireHost")
out = Path("AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/presentation/pages/CodeEditorPage.tsx")
out.write_text(text, encoding="utf-8")
print(f"Wrote {out} ({len(text)} chars)")
PY
