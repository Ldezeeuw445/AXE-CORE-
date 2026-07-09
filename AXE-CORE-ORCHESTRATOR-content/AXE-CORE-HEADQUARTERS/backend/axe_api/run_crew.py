#!/usr/bin/env python3
"""
run_crew.py — standalone CrewAI runner (Branch A of the AXE CORE architecture).

Invoked by axe_api's crew_runner (subprocess, isolated venv). Reads a JSON
payload from argv[1] or stdin:
    {"task": "...", "context": "...", "conversation": [{"role","content"}]}
and prints a JSON result to stdout:
    {"status": "ok", "result": "..."}  |  {"status": "error", "error": "..."}

The crew project lives next to the repo root (CREW_PROJECT_DIR).
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

from axe_core___god_mode_ai_system.crew import AxeCoreGodModeAiSystemCrew  # noqa: E402


def build_request(task: str, context: str | None, conversation: list | None) -> str:
    parts = [f"USER REQUEST:\n{task.strip()}"]
    if context and context.strip():
        parts.append(f"\nCONTEXT FROM ECOSYSTEM:\n{context.strip()}")
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


def main() -> None:
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    data = json.loads(raw or "{}")
    task = data.get("task", "")
    if not task or not str(task).strip():
        print(json.dumps({"status": "error", "error": "task is required"}))
        return

    user_request = build_request(str(task), data.get("context"), data.get("conversation"))
    try:
        result = AxeCoreGodModeAiSystemCrew().crew().kickoff(inputs={"user_request": user_request})
        text = getattr(result, "raw", None) or str(result)
        print(json.dumps({"status": "ok", "result": text}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "error", "error": f"{type(e).__name__}: {e}"}))


if __name__ == "__main__":
    main()
