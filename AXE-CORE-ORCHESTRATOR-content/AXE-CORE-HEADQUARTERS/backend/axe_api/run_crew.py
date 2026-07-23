#!/usr/bin/env python3
"""
run_crew.py — standalone CrewAI runner (Branch A of the AXE CORE architecture).

Invoked by axe_api's crew_runner (subprocess, isolated venv):

    python run_crew.py <payload_file.json> <result_file.json>

payload_file: {"task","context","conversation","specialists"}
result_file : {"status":"ok","result":...} | {"status":"error","error":...}

The result is written to <result_file> (not stdout) so CrewAI's verbose logging
can never corrupt the JSON the parent process reads. Falls back to stdin/stdout
when invoked without file args (backwards compatible).

Smart routing: only the specialists chosen by the LangGraph orchestrator are
instantiated and run (via crew.run_crew_kickoff) — not all 9 agents.
"""
from __future__ import annotations
import os
import sys
import json

_CREW_DIRNAME = "axe_core___god_mode_ai_system_v1_crewai-project"
_PKG = "axe_core___god_mode_ai_system"


def _resolve_crew_project_dir() -> str:
    """Find the crew project by locating the dir whose src/ actually contains
    the package. The old hard-coded "../../../.." relative path assumed the
    repo layout, but deploy.sh copies run_crew.py to /opt/axe-core-api/ where
    that relative walk lands above /opt and misses the crew — the cause of
    'ModuleNotFoundError: No module named axe_core___god_mode_ai_system'."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = []
    env = os.environ.get("CREW_PROJECT_DIR")
    if env:
        candidates.append(env)
    # Relative repo layout (dev + the git checkout under HEADQUARTERS/backend).
    candidates.append(os.path.normpath(os.path.join(here, "..", "..", "..", "..", _CREW_DIRNAME)))
    # Walk up from run_crew.py looking for a sibling crew dir (covers the
    # /opt/axe-core-api git checkout, whatever depth it sits at).
    d = here
    for _ in range(8):
        candidates.append(os.path.join(d, _CREW_DIRNAME))
        d = os.path.dirname(d)
    candidates.append(os.path.join("/opt/axe-core-api", _CREW_DIRNAME))
    for c in candidates:
        if c and os.path.isdir(os.path.join(c, "src", _PKG)):
            return c
    # Nothing found — return the first candidate so the import error is clear.
    return candidates[0] if candidates else here


CREW_PROJECT_DIR = _resolve_crew_project_dir()

sys.path.insert(0, os.path.join(CREW_PROJECT_DIR, "src"))


def build_request(task: str, context, conversation) -> str:
    parts = [f"USER REQUEST:\n{task.strip()}"]
    if context and str(context).strip():
        parts.append(f"\nCONTEXT FROM ECOSYSTEM:\n{str(context).strip()}")
    if conversation:
        try:
            conv_text = "\n".join(
                f"{m.get('role', 'user')}: {m.get('content', m.get('text', ''))}"
                for m in conversation[-12:]
            )
            if conv_text.strip():
                parts.append(f"\nRECENT CONVERSATION:\n{conv_text}")
        except Exception:
            pass
    return "\n".join(parts)


def _write(result_path: str | None, obj: dict) -> None:
    data = json.dumps(obj)
    if result_path:
        with open(result_path, "w") as f:
            f.write(data)
    else:
        print(data)


def main() -> None:
    payload_path = sys.argv[1] if len(sys.argv) > 1 else None
    result_path = sys.argv[2] if len(sys.argv) > 2 else None

    # Read the payload: from a file (new), raw JSON in argv (compat), or stdin.
    try:
        if payload_path and os.path.exists(payload_path):
            with open(payload_path) as f:
                raw = f.read()
        elif payload_path:
            raw = payload_path  # backwards-compat: raw JSON passed directly
        else:
            raw = sys.stdin.read()
        data = json.loads(raw or "{}")
    except Exception as e:  # noqa: BLE001
        _write(result_path, {"status": "error", "error": f"bad payload: {e}"})
        return

    task = data.get("task", "")
    if not task or not str(task).strip():
        _write(result_path, {"status": "error", "error": "task is required"})
        return

    specialists = data.get("specialists") or []
    user_request = build_request(str(task), data.get("context"), data.get("conversation"))

    try:
        from axe_core___god_mode_ai_system.crew import run_crew_kickoff
        text = run_crew_kickoff(specialists, user_request)
        _write(result_path, {"status": "ok", "result": text, "specialists": specialists})
    except Exception as e:  # noqa: BLE001
        _write(result_path, {"status": "error", "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
