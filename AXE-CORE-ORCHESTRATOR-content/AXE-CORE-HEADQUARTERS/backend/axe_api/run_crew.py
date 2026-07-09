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

CREW_PROJECT_DIR = os.environ.get(
    "CREW_PROJECT_DIR",
    os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..",
        "axe_core___god_mode_ai_system_v1_crewai-project",
    )),
)

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
